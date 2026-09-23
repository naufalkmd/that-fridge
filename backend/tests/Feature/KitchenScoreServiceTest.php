<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\OrganizerTally;
use App\Models\Section;
use App\Models\ShoppingItem;
use App\Models\User;
use App\Services\KitchenScoreService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KitchenScoreServiceTest extends TestCase
{
    use RefreshDatabase;

    private function itemFor(User $user, array $overrides = []): void
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
        $section->items()->create(array_merge([
            'name' => 'Milk',
            'icon' => 'milk',
            'location' => 'fridge',
            'quantity' => 1,
            'expiry_date' => now()->addDays(5)->toDateString(),
            'shelf_life_days' => 7,
        ], $overrides));
    }

    public function test_a_user_with_no_items_or_usage_gets_a_null_waste_score(): void
    {
        $user = User::factory()->create();

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertNull($score['wasteScore']);
        $this->assertNull($score['balanceScore']);
        $this->assertNull($score['organizerScore']);
        $this->assertNull($score['shopkeeperScore']);
        $this->assertSame(0, $score['overdueCount']);
    }

    public function test_organizer_score_needs_at_least_five_checked_items(): void
    {
        $user = User::factory()->create();
        OrganizerTally::create(['user_id' => $user->id, 'items_checked_total' => 4, 'items_correct_total' => 4]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertNull($score['organizerScore']);
    }

    public function test_organizer_score_is_the_correct_ratio(): void
    {
        $user = User::factory()->create();
        OrganizerTally::create(['user_id' => $user->id, 'items_checked_total' => 10, 'items_correct_total' => 8]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertSame(80, $score['organizerScore']);
    }

    public function test_shopkeeper_score_needs_at_least_three_items(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $fridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => true]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertNull($score['shopkeeperScore']);
    }

    public function test_shopkeeper_score_is_the_checked_ratio_across_member_fridges(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $fridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => true]);
        $fridge->shoppingItems()->create(['name' => 'Eggs', 'section' => 'dairy', 'checked' => true]);
        $fridge->shoppingItems()->create(['name' => 'Bread', 'section' => 'bakery', 'checked' => false]);
        $fridge->shoppingItems()->create(['name' => 'Butter', 'section' => 'dairy', 'checked' => false]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertSame(50, $score['shopkeeperScore']);
    }

    public function test_overdue_items_lower_the_waste_score_below_the_neutral_base(): void
    {
        $user = User::factory()->create();
        // One overdue, one fresh - a 50% overdue ratio.
        $this->itemFor($user, ['expiry_date' => now()->subDays(2)->toDateString(), 'shelf_life_days' => 7]);
        $this->itemFor($user, ['expiry_date' => now()->addDays(5)->toDateString(), 'shelf_life_days' => 7]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        // base 75 - min(30, round(0.5*60)) = 75 - 30 = 45.
        $this->assertSame(45, $score['wasteScore']);
        $this->assertSame(1, $score['overdueCount']);
    }

    public function test_a_user_with_nothing_overdue_scores_above_the_neutral_base(): void
    {
        $user = User::factory()->create();
        $this->itemFor($user);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertSame(75, $score['wasteScore']);
    }

    public function test_food_balance_needs_at_least_three_recent_usage_entries(): void
    {
        $user = User::factory()->create();
        $user->usageHistory()->create(['key' => 'a', 'name' => 'A', 'icon' => 'item', 'category' => 'protein', 'count' => 3, 'last_used_at' => now()]);
        $user->usageHistory()->create(['key' => 'b', 'name' => 'B', 'icon' => 'item', 'category' => 'vegetables', 'count' => 3, 'last_used_at' => now()]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        $this->assertNull($score['balanceScore']);
    }

    public function test_food_balance_rewards_variety_across_categories(): void
    {
        $user = User::factory()->create();
        $user->usageHistory()->create(['key' => 'a', 'name' => 'A', 'icon' => 'item', 'category' => 'protein', 'count' => 5, 'last_used_at' => now()]);
        $user->usageHistory()->create(['key' => 'b', 'name' => 'B', 'icon' => 'item', 'category' => 'vegetables', 'count' => 3, 'last_used_at' => now()]);
        $user->usageHistory()->create(['key' => 'c', 'name' => 'C', 'icon' => 'item', 'category' => 'fruit', 'count' => 2, 'last_used_at' => now()]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        // 3/5 groups used, largest share 5/10 = 0.5: 55*0.6 + 45*0.5 = 33 + 22.5 = 55.5 -> 56.
        $this->assertSame(56, $score['balanceScore']);
    }

    public function test_food_balance_excludes_other_extras_and_stale_entries(): void
    {
        $user = User::factory()->create();
        $user->usageHistory()->create(['key' => 'a', 'name' => 'A', 'icon' => 'item', 'category' => 'protein', 'count' => 3, 'last_used_at' => now()]);
        $user->usageHistory()->create(['key' => 'b', 'name' => 'B', 'icon' => 'item', 'category' => 'other_extras', 'count' => 3, 'last_used_at' => now()]);
        $user->usageHistory()->create(['key' => 'c', 'name' => 'C', 'icon' => 'item', 'category' => 'fruit', 'count' => 3, 'last_used_at' => now()->subDays(45)]);

        $score = app(KitchenScoreService::class)->scoreFor($user);

        // Only the protein row is both counted-category and recent - below BALANCE_MIN_ENTRIES.
        $this->assertNull($score['balanceScore']);
    }
}
