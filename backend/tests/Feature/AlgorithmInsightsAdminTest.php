<?php

namespace Tests\Feature;

use App\Filament\Pages\AlgorithmInsights;
use App\Models\AdminAuditLog;
use App\Models\AlgoFeedbackEvent;
use App\Models\AnalyticsEvent;
use App\Models\GeneratedIcon;
use App\Models\Product;
use App\Models\User;
use App\Services\AlgorithmInsightsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class AlgorithmInsightsAdminTest extends TestCase
{
    use RefreshDatabase;

    private function event(User $user, string $algo, string $kind, array $over = []): AlgoFeedbackEvent
    {
        return AlgoFeedbackEvent::create(array_merge([
            'user_id' => $user->id, 'algo' => $algo, 'kind' => $kind, 'rules_v' => 1,
            'occurred_at' => now()->subHours(2),
        ], $over));
    }

    private function report(): AlgorithmInsightsReport
    {
        return app(AlgorithmInsightsReport::class);
    }

    public function test_outcome_metrics_compute_rates_from_events(): void
    {
        $user = User::factory()->create();
        foreach (['used', 'used', 'used', 'wasted'] as $outcome) {
            $this->event($user, 'removal', 'removed', ['outcome' => $outcome]);
        }
        foreach (range(1, 4) as $_) {
            $this->event($user, 'expiry_alert', 'sent');
        }
        $this->event($user, 'expiry_alert', 'acted', ['source' => 'within_24h']);
        $this->event($user, 'expiry_alert', 'acted', ['source' => 'later']);
        $this->event($user, 'recipe', 'made', ['source' => 'suggested', 'final_number' => 1]);
        $this->event($user, 'recipe', 'made', ['source' => 'suggested', 'final_number' => 3]);
        $this->event($user, 'recipe', 'made', ['source' => 'suggested', 'final_number' => 6]);
        $this->event($user, 'add_flow', 'saved', ['source' => 'manual', 'final_number' => 10]);
        $this->event($user, 'add_flow', 'saved', ['source' => 'manual', 'final_number' => 20]);

        $m = $this->report()->outcomeMetrics();

        $this->assertSame(25.0, $m['waste_rate']);
        $this->assertSame(3, $m['removed_used']);
        $this->assertSame(25.0, $m['expiry_alert_action_rate']); // only the within-24h one counts
        $this->assertSame(3, $m['recipes_made_from_suggestions']);
        $this->assertSame(33.3, $m['recipe_top1_rate']);
        $this->assertSame(66.7, $m['recipe_top3_rate']);
        $this->assertSame([['source' => 'manual', 'events' => 2, 'seconds' => 15.0]], $m['add_seconds_by_source']);
        $this->assertNull($m['low_stock_action_rate']);
    }

    public function test_corrections_and_rule_suggestions_need_enough_different_people(): void
    {
        $users = User::factory()->count(5)->create();
        foreach ($users as $i => $user) {
            $this->event($user, 'food_group', 'corrected', ['guess' => 'dairy', 'final' => 'other_extras', 'outcome' => 'corrected']);
            if ($i < 2) {
                $this->event($user, 'icon', 'corrected', ['guess' => 'egg', 'final' => 'eggplant', 'outcome' => 'corrected']);
            }
        }
        // Not corrected, but shares a guess - drives the "share of its uses" figure.
        $this->event($users[0], 'food_group', 'assigned', ['guess' => 'dairy', 'final' => 'dairy', 'outcome' => 'accepted']);

        $this->assertCount(1, $this->report()->topCorrections('food_group'));
        $this->assertCount(0, $this->report()->topCorrections('icon')); // only 2 people

        $suggestions = $this->report()->ruleSuggestions();
        $this->assertCount(1, $suggestions);
        $this->assertSame(5, $suggestions[0]['users']);
        $this->assertSame(83.3, $suggestions[0]['share']); // 5 of 6 uses of the "dairy" guess
        $this->assertStringContainsString('"dairy" was changed to "other_extras"', $suggestions[0]['suggestion']);
    }

    public function test_data_health_flags_collection_off_and_a_volume_drop(): void
    {
        $this->assertFalse($this->report()->dataHealth()['enabled']);

        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        foreach (range(2, 8) as $daysAgo) { // a steady 10 a day over the baseline week
            foreach (range(1, 10) as $_) {
                $this->event($user, 'icon', 'assigned', ['occurred_at' => now('UTC')->startOfDay()->subDays($daysAgo)->addHours(3), 'class' => 'egg']);
            }
        }
        $this->event($user, 'icon', 'assigned', ['occurred_at' => now('UTC')->startOfDay()->subDay()->addHours(3)]); // yesterday: 1

        $health = $this->report()->dataHealth();
        $row = collect($health['rows'])->firstWhere('algo', 'icon');
        $this->assertTrue($health['enabled']);
        $this->assertSame(1, $row['yesterday']);
        $this->assertTrue($row['dropped']);
        $this->assertNotNull($row['no_class_rate']);
    }

    public function test_icon_requests_are_hidden_below_three_people(): void
    {
        $users = User::factory()->count(3)->create();
        foreach ($users as $i => $user) {
            GeneratedIcon::create(['user_id' => $user->id, 'kind' => 'item', 'credits' => 3, 'prompt' => ' Dragon Fruit ', 'image_path' => 'icons/a.png', 'image_url' => 'https://cdn.test/a.png']);
            if ($i === 0) {
                GeneratedIcon::create(['user_id' => $user->id, 'kind' => 'item', 'credits' => 3, 'prompt' => 'secret sauce', 'image_path' => 'icons/b.png', 'image_url' => 'https://cdn.test/b.png']);
            }
        }

        $rows = $this->report()->iconRequests();
        $this->assertCount(1, $rows);
        $this->assertSame('dragon fruit', $rows[0]['prompt']);
        $this->assertSame(3, (int) $rows[0]['users']);
    }

    public function test_retention_counts_only_matured_cohort_days(): void
    {
        $today = now('UTC')->startOfDay();
        $signup = $today->copy()->subDays(10)->addHours(2);
        $returned = User::factory()->create();
        $returned->forceFill(['created_at' => $signup])->saveQuietly();
        $gone = User::factory()->create();
        $gone->forceFill(['created_at' => $signup])->saveQuietly();
        AnalyticsEvent::create(['user_id' => $returned->id, 'name' => 'app_open', 'occurred_at' => now()->subDay()]);

        $cohort = collect($this->report()->retention())->first(fn ($c) => $c['users'] >= 2);

        $this->assertSame(50.0, $cohort['d1']);
        $this->assertSame(50.0, $cohort['d7']);
        $this->assertNull($cohort['d30']); // 10 days old: D30 hasn't matured
    }

    public function test_page_renders_for_admin_and_creates_a_product_only_for_qualifying_barcodes(): void
    {
        config(['app.admin_emails' => ['admin@example.com'], 'app.algo_feedback_enabled' => true]);
        $admin = User::factory()->create(['email' => 'admin@example.com']);
        $this->actingAs($admin);

        foreach (User::factory()->count(3)->create() as $user) {
            $this->event($user, 'barcode', 'miss_named', ['guess' => '1234567890123', 'name_key' => 'mystery oat milk']);
        }
        $this->event($admin, 'barcode', 'miss_named', ['guess' => '999', 'name_key' => 'lonely thing']);

        Livewire::test(AlgorithmInsights::class)
            ->assertSuccessful()
            ->assertSee('Data health')->assertSee('Outcome metrics')->assertSee('Retention')
            ->assertSee('Rule suggestions')->assertSee('Icon requests')->assertSee('mystery oat milk')
            ->call('createProduct', '999', 'lonely thing') // only 1 person: refused
            ->call('createProduct', '1234567890123', 'mystery oat milk');

        $this->assertDatabaseMissing('products', ['barcode' => '999']);
        $this->assertDatabaseHas('products', ['barcode' => '1234567890123', 'name' => 'Mystery Oat Milk']);
        $this->assertSame(1, Product::count());
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'created_product_from_insights']);
        $this->assertSame(1, AdminAuditLog::where('action', 'created_product_from_insights')->count());

        // A second click on an already-created barcode is a no-op, not a duplicate.
        Livewire::test(AlgorithmInsights::class)->call('createProduct', '1234567890123', 'mystery oat milk');
        $this->assertSame(1, Product::count());
    }
}
