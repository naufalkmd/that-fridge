<?php

namespace Tests\Feature;

use App\Filament\Resources\AdminAuditLogResource\Pages\ListAdminAuditLogs;
use App\Filament\Resources\AnalyticsEventResource\Pages\ListAnalyticsEvents;
use App\Filament\Resources\FeedbackResource;
use App\Filament\Resources\FeedbackResource\Pages\ListFeedback;
use App\Filament\Resources\GeneratedIconResource\Pages\ListGeneratedIcons;
use App\Filament\Widgets\CreditSpendChart;
use App\Filament\Widgets\SignupsChart;
use App\Filament\Widgets\StatsOverview;
use App\Models\AdminAuditLog;
use App\Models\AnalyticsEvent;
use App\Models\Feedback;
use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use App\Models\User;
use App\Services\AdminStats;
use App\Services\OnboardingFunnelReport;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;
use Tests\TestCase;

class AdminPanelPerformanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.admin_emails' => ['admin@example.com']]);
        $this->actingAs(User::factory()->create(['email' => 'admin@example.com']));
    }

    public function test_dashboard_widgets_do_not_poll(): void
    {
        foreach ([StatsOverview::class, SignupsChart::class, CreditSpendChart::class] as $widget) {
            $this->assertNull((fn () => $this->getPollingInterval())->call(new $widget), $widget);
        }
    }

    public function test_ai_icon_list_does_not_query_shared_icons_per_row(): void
    {
        $this->assertSame($this->sharedIconQueriesFor(3), $this->sharedIconQueriesFor(30));
    }

    public function test_a_generated_icon_can_only_be_in_the_pack_once(): void
    {
        $icon = $this->generatedIcons(1)->first();
        SharedIcon::create(['image_path' => 'a', 'image_url' => 'a', 'source_generated_icon_id' => $icon->id]);

        $this->expectException(UniqueConstraintViolationException::class);
        SharedIcon::create(['image_path' => 'b', 'image_url' => 'b', 'source_generated_icon_id' => $icon->id]);
    }

    public function test_credit_spend_is_grouped_in_sql_and_folds_admin_adjustments(): void
    {
        $user = User::factory()->create();
        foreach ([
            ['chat', -3], ['chat', -2], ['icon', -1],
            ['admin_adjust:a@x', -4], ['admin_adjust:b@x', -1],
            ['pro_grant', 400], // grants aren't spend
        ] as [$reason, $delta]) {
            $user->aiCreditLedger()->create(['delta' => $delta, 'balance_after' => 0, 'reason' => $reason]);
        }

        $spend = app(AdminStats::class)->creditSpendByReason(7);

        $this->assertEquals(['chat' => 5, 'admin_adjust' => 5, 'icon' => 1], $spend);
        $this->assertSame('icon', array_key_last($spend)); // biggest first
    }

    public function test_funnel_unique_counts_match_the_original_identity_rules(): void
    {
        $userA = User::factory()->create();
        $user123 = User::factory()->create(['id' => 123]);
        $step = 'onboarding_started';

        foreach ([
            ['anon_id' => 'x1'],                              // anon only
            ['anon_id' => 'x1'],                              // same install again
            ['user_id' => $userA->id],                        // user only
            ['anon_id' => 'x2', 'user_id' => $userA->id],     // both: the anon id wins
            ['anon_id' => '', 'user_id' => $userA->id],       // empty anon id = missing -> same as userA
            ['anon_id' => 'u123'],                            // looks like user 123 ...
            ['user_id' => $user123->id],                      // ... but must stay a separate identity
            [],                                               // neither id
            [],                                               // neither again -> same shared identity
        ] as $ids) {
            AnalyticsEvent::create(['name' => $step] + $ids);
        }

        $row = collect(app(OnboardingFunnelReport::class)->stepCounts(14))->firstWhere('label', 'Onboarding started');

        // x1, userA, x2, u123 (anon), user 123, and the one "no id" identity.
        $this->assertSame(['label' => 'Onboarding started', 'events' => 9, 'unique' => 6], $row);
    }

    public function test_auth_methods_are_grouped_in_sql_with_unknown_for_missing(): void
    {
        AnalyticsEvent::create(['name' => 'signup_completed', 'props' => ['method' => 'email']]);
        AnalyticsEvent::create(['name' => 'auth_completed', 'props' => ['method' => 'google']]);
        AnalyticsEvent::create(['name' => 'auth_completed', 'props' => ['method' => 'google']]);
        AnalyticsEvent::create(['name' => 'login_completed', 'props' => ['other' => 1]]);
        AnalyticsEvent::create(['name' => 'login_completed']);
        AnalyticsEvent::create(['name' => 'app_open', 'props' => ['method' => 'nope']]); // not an auth event

        $this->assertEquals(
            ['email' => 1, 'google' => 2, 'unknown' => 2],
            app(OnboardingFunnelReport::class)->authMethods(14)->sortKeys()->all(),
        );
    }

    public function test_feedback_badge_is_cached_but_refreshes_on_every_write(): void
    {
        $this->assertNull(FeedbackResource::getNavigationBadge());

        $feedback = Feedback::create(['email' => 'a@b.c', 'message' => 'Hi']); // app write path
        $this->assertSame('1', FeedbackResource::getNavigationBadge());

        Livewire::test(ListFeedback::class)->callTableAction('toggleStatus', $feedback);
        $this->assertNull(FeedbackResource::getNavigationBadge());

        // Proves it is cached: a write that skips Eloquent events isn't seen until expiry.
        DB::table('feedback')->insert(['email' => 'x@y.z', 'message' => 'raw', 'status' => 'new', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertNull(FeedbackResource::getNavigationBadge());
    }

    public function test_analytics_list_uses_simple_pagination_but_the_audit_log_keeps_page_numbers(): void
    {
        AnalyticsEvent::create(['name' => 'app_open']);
        AdminAuditLog::record('test');

        $analytics = Livewire::test(ListAnalyticsEvents::class)->instance()->getTableRecords();
        $audit = Livewire::test(ListAdminAuditLogs::class)->instance()->getTableRecords();

        $this->assertInstanceOf(Paginator::class, $analytics);
        $this->assertNotInstanceOf(LengthAwarePaginator::class, $analytics);
        $this->assertInstanceOf(LengthAwarePaginator::class, $audit);
    }

    private function sharedIconQueriesFor(int $rows): int
    {
        GeneratedIcon::query()->delete();
        $icons = $this->generatedIcons($rows);
        SharedIcon::create(['image_path' => 's', 'image_url' => 's', 'source_generated_icon_id' => $icons->first()->id]);
        Cache::flush();

        DB::flushQueryLog();
        DB::enableQueryLog();
        Livewire::test(ListGeneratedIcons::class)->set('tableRecordsPerPage', 50)->assertOk();
        $queries = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'shared_icons'))->count();
        DB::disableQueryLog();

        SharedIcon::query()->delete();

        return $queries;
    }

    private function generatedIcons(int $count)
    {
        $owner = User::factory()->create();

        return collect(range(1, $count))->map(fn ($i) => GeneratedIcon::create([
            'user_id' => $owner->id, 'kind' => 'icon', 'credits' => 1,
            'prompt' => "p{$i}", 'image_path' => "icons/{$i}.png", 'image_url' => "http://x/{$i}.png",
        ]));
    }
}
