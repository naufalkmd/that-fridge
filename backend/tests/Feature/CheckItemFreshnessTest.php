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
            // Well-stocked on purpose - these tests are only about the expiry check, and a
            // low quantity would also trip the independent low-stock check (see
            // CheckLowStockTest below), which isn't what any of these are testing.
            'quantity' => 10,
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

    private function itemWithQuantity(int $quantity, ?User $user = null): Item
    {
        $user ??= User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        return $section->items()->create([
            'name' => 'Eggs',
            'icon' => 'eggs',
            'location' => 'fridge',
            'quantity' => $quantity,
            // Not expiring soon on purpose - these tests are only about the low-stock check.
            'expiry_date' => now()->addDays(30)->toDateString(),
            'shelf_life_days' => 30,
        ]);
    }

    public function test_it_creates_a_low_stock_notification_for_an_item_at_or_below_the_threshold(): void
    {
        $item = $this->itemWithQuantity(2);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseHas('notification_events', [
            'item_id' => $item->id,
            'kind' => 'lowStock',
        ]);
    }

    public function test_it_ignores_a_well_stocked_item(): void
    {
        $item = $this->itemWithQuantity(10);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseMissing('notification_events', ['item_id' => $item->id]);
    }

    public function test_it_does_not_duplicate_a_low_stock_notification_on_a_second_run(): void
    {
        $item = $this->itemWithQuantity(1);

        $this->artisan('app:check-item-freshness');
        $this->artisan('app:check-item-freshness');

        $this->assertSame(1, NotificationEvent::where('item_id', $item->id)->where('kind', 'lowStock')->count());
    }

    public function test_it_respects_a_users_disabled_low_stock_preference(): void
    {
        $user = User::factory()->create();
        NotificationPref::create(['user_id' => $user->id, 'low_stock' => false]);
        $item = $this->itemWithQuantity(1, $user);

        $this->artisan('app:check-item-freshness');

        $this->assertDatabaseMissing('notification_events', ['item_id' => $item->id]);
    }

    public function test_an_already_notified_low_stock_item_is_not_duplicated_while_a_new_one_still_gets_notified(): void
    {
        $oldItem = $this->itemWithQuantity(1);
        NotificationEvent::create([
            'fridge_id' => $oldItem->section->fridge_id,
            'item_id' => $oldItem->id,
            'kind' => 'lowStock',
            'message' => 'old',
            'done' => true,
        ]);

        $newItem = $this->itemWithQuantity(1);

        $this->artisan('app:check-item-freshness');

        $this->assertSame(1, NotificationEvent::where('item_id', $oldItem->id)->where('kind', 'lowStock')->count());
        $this->assertDatabaseHas('notification_events', ['item_id' => $newItem->id, 'kind' => 'lowStock']);
    }
}
