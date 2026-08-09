<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\NotificationEvent;
use App\Models\NotificationPref;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckItemFreshnessTest extends TestCase
{
    use RefreshDatabase;

    private function itemExpiringIn(int $days, ?User $user = null): Item
    {
        $user ??= User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        return $section->items()->create([
            'name' => 'Milk',
            'icon' => 'milk',
            'location' => 'fridge',
            'quantity' => 1,
            'expiry_date' => now()->addDays($days)->toDateString(),
            'shelf_life_days' => 7,
        ]);
    }

    public function test_it_creates_a_notification_for_an_item_expiring_within_the_warning_window(): void
    {
        $item = $this->itemExpiringIn(2);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseHas('notification_events', [
            'item_id' => $item->id,
            'kind' => 'expiring',
        ]);
    }

    public function test_it_ignores_an_item_that_is_not_close_to_expiring(): void
    {
        $item = $this->itemExpiringIn(30);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseMissing('notification_events', ['item_id' => $item->id]);
    }

    public function test_it_does_not_duplicate_a_notification_on_a_second_run(): void
    {
        $item = $this->itemExpiringIn(1);

        $this->artisan('app:check-item-freshness');
        $this->artisan('app:check-item-freshness');

        $this->assertSame(1, NotificationEvent::where('item_id', $item->id)->count());
    }

    public function test_it_respects_a_users_disabled_expiry_alerts_preference(): void
    {
        $user = User::factory()->create();
        NotificationPref::create(['user_id' => $user->id, 'expiry_alerts' => false]);
        $item = $this->itemExpiringIn(1, $user);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseMissing('notification_events', ['item_id' => $item->id]);
    }

    public function test_the_already_notified_lookup_is_scoped_to_this_runs_items_not_the_full_history(): void
    {
        // An item from a past run, already notified and long expired - this is exactly what
        // the unscoped ->pluck('item_id') query used to load in full on every single run.
        $oldItem = $this->itemExpiringIn(-30);
        NotificationEvent::create([
            'fridge_id' => $oldItem->section->fridge_id,
            'item_id' => $oldItem->id,
            'kind' => 'expiring',
            'message' => 'old',
            'done' => true,
        ]);

        // A brand-new item expiring soon, notified for the first time in this run.
        $newItem = $this->itemExpiringIn(1);

        \DB::enableQueryLog();
        $this->artisan('app:check-item-freshness');
        $log = collect(\DB::getQueryLog());
        \DB::disableQueryLog();

        $notifiedLookup = $log->first(fn ($q) => str_contains($q['query'], 'notification_events') && str_contains($q['query'], 'where'));

        $this->assertNotNull($notifiedLookup, 'expected a scoped lookup against notification_events');
        $this->assertStringContainsString('in (', strtolower($notifiedLookup['query']));

        // and the new item still gets notified regardless.
        $this->assertDatabaseHas('notification_events', ['item_id' => $newItem->id]);
    }
}
