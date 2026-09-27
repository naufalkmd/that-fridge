<?php

namespace Tests\Feature;

use App\Filament\Resources\ApiUsageLogResource\Pages\ListApiUsageLogs;
use App\Models\AiCreditLedger;
use App\Models\ApiUsageLog;
use App\Models\User;
use App\Services\AiCostReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Livewire\Livewire;
use Tests\TestCase;

class AiCostsAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['app.admin_emails' => ['admin@example.com']]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
    }

    private function logCall(?User $user, string $feature, ?float $cost, array $over = []): ApiUsageLog
    {
        return ApiUsageLog::create(array_merge([
            'provider' => 'openrouter', 'feature' => $feature, 'model' => 'anthropic/claude-haiku-4.5',
            'user_id' => $user?->id, 'prompt_tokens' => 2000, 'completion_tokens' => 900, 'cost_usd' => $cost, 'ok' => true,
        ], $over));
    }

    private function ledger(User $user, int $delta, string $reason): void
    {
        AiCreditLedger::create(['user_id' => $user->id, 'delta' => $delta, 'balance_after' => 0, 'reason' => $reason]);
    }

    /** Two photo scans and a chat by two users, one refunded scan, a free background call and a grant. */
    private function seedUsage(): array
    {
        $heavy = User::factory()->create(['name' => 'Heavy', 'email' => 'heavy@example.com']);
        $light = User::factory()->create(['name' => 'Light', 'email' => 'light@example.com']);

        $this->logCall($heavy, 'Fridge photo scan', 0.008);
        $this->logCall($heavy, 'Fridge photo scan', 0.008);
        $this->logCall($heavy, 'Fridge photo scan', null, ['ok' => false]);
        $this->logCall($light, 'Quick Chat', 0.002);
        $this->logCall(null, 'Chat memory', 0.0005);
        $old = $this->logCall($light, 'Quick Chat', 5.0);
        $old->forceFill(['created_at' => now()->subDays(40)])->save();

        $this->ledger($heavy, -3, 'photo_scan');
        $this->ledger($heavy, -3, 'photo_scan');
        $this->ledger($heavy, -3, 'photo_scan');
        $this->ledger($heavy, 3, 'photo_scan_refund');
        $this->ledger($light, -1, 'chat');
        $this->ledger($light, 50, 'monthly_free');

        return [$heavy, $light];
    }

    public function test_by_feature_totals_cost_and_nets_credits_against_refunds(): void
    {
        $this->seedUsage();

        $rows = collect(app(AiCostReport::class)->byFeature(30))->keyBy('feature');

        $photo = $rows['Fridge photo scan'];
        $this->assertSame(3, $photo['calls']);
        $this->assertSame(1, $photo['failed']);
        $this->assertSame(1, $photo['users']);
        $this->assertSame(0.016, $photo['cost']);
        $this->assertSame(6, $photo['credits']); // 9 spent, 3 refunded
        $this->assertSame(0.044, $photo['margin']); // $0.06 of credits - $0.016

        $this->assertSame(1, $rows['Quick Chat']['calls']); // the 40-day-old call is outside the window
        $this->assertSame(1, $rows['Quick Chat']['credits']);
        $this->assertNull($rows['Chat memory']['credits']); // free to users: pure cost
        $this->assertSame('Fridge photo scan', $rows->keys()->first()); // most expensive first
    }

    public function test_by_user_ranks_by_cost_with_credits_and_top_feature(): void
    {
        [$heavy, $light] = $this->seedUsage();

        $users = app(AiCostReport::class)->byUser(30);

        $this->assertSame([$heavy->id, $light->id], array_column($users, 'user_id'));
        $this->assertSame('Fridge photo scan', $users[0]['top_feature']);
        $this->assertSame(6, $users[0]['credits']);
        $this->assertSame(1, $users[1]['credits']); // the monthly grant isn't counted as a charge
        $this->assertSame(0.008, $users[1]['margin']); // $0.01 of credits - $0.002
    }

    public function test_totals_cover_the_period(): void
    {
        $this->seedUsage();

        $t = app(AiCostReport::class)->totals(30);

        $this->assertSame(0.0185, $t['cost']);
        $this->assertSame(5, $t['calls']);
        $this->assertSame(7, $t['credits']);
    }

    public function test_reasons_map_to_features(): void
    {
        $this->assertSame('Quick Chat', AiCostReport::featureForReason('chat_pdf'));
        $this->assertSame('Fridge photo scan', AiCostReport::featureForReason('photo_scan_refund'));
        $this->assertNull(AiCostReport::featureForReason('pack_purchase'));
        $this->assertNull(AiCostReport::featureForReason('monthly_free'));
    }

    public function test_the_page_and_call_log_render_for_an_admin(): void
    {
        $this->seedUsage();
        $this->actingAs($this->admin);

        $this->get('/admin/ai-costs')->assertOk()->assertSee('Fridge photo scan')->assertSee('heavy@example.com');
        $this->get('/admin/ai-costs?days=7')->assertOk();
        $this->get('/admin/api-usage-logs')->assertOk()->assertSee('Quick Chat');
    }

    public function test_the_call_log_filters_by_user(): void
    {
        [$heavy, $light] = $this->seedUsage();
        $this->actingAs($this->admin);

        Livewire::test(ListApiUsageLogs::class)
            ->filterTable('user_id', $light->id)
            ->assertCanSeeTableRecords(ApiUsageLog::where('user_id', $light->id)->get())
            ->assertCanNotSeeTableRecords(ApiUsageLog::where('user_id', $heavy->id)->get());
    }

    public function test_non_admins_cannot_open_either(): void
    {
        $this->actingAs(User::factory()->create(['email' => 'someone@example.com']));

        $this->get('/admin/ai-costs')->assertForbidden();
        $this->get('/admin/api-usage-logs')->assertForbidden();
    }
}
