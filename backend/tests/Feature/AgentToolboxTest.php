<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use App\Models\UserBadge;
use App\Services\AgentToolbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentToolboxTest extends TestCase
{
    use RefreshDatabase;

    private AgentToolbox $toolbox;

    private User $user;

    private Fridge $fridge;

    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        $this->toolbox = app(AgentToolbox::class);
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
        $this->section = Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function item(array $attrs = []): Item
    {
        return Item::create(array_merge([
            'section_id' => $this->section->id,
            'name' => 'Milk',
            'icon' => 'milk',
            'quantity' => 1,
            'location' => 'fridge',
        ], $attrs));
    }

    public function test_list_items_shows_only_the_users_items_and_filters_expired(): void
    {
        $this->item(['name' => 'Fresh Yogurt', 'expiry_date' => now()->addDays(5)]);
        $this->item(['name' => 'Old Spinach', 'expiry_date' => now()->subDays(2)]);
        // another user's fridge - must not leak
        $other = Section::create(['fridge_id' => Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'X'])->id, 'name' => 'S']);
        Item::create(['section_id' => $other->id, 'name' => 'Not Mine', 'icon' => 'x', 'quantity' => 1]);

        $all = $this->toolbox->run('list_items', [], $this->user, $this->fridge->id);
        $this->assertStringContainsString('Fresh Yogurt', $all['content']);
        $this->assertStringContainsString('Old Spinach', $all['content']);
        $this->assertStringNotContainsString('Not Mine', $all['content']);

        $expired = $this->toolbox->run('list_items', ['expired_only' => true], $this->user, $this->fridge->id);
        $this->assertStringContainsString('Old Spinach', $expired['content']);
        $this->assertStringNotContainsString('Fresh Yogurt', $expired['content']);
    }

    public function test_list_notes_returns_the_fridge_notes(): void
    {
        FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'buy milk', 'color' => 'amber']);

        $out = $this->toolbox->run('list_notes', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('buy milk', $out['content']);
    }

    public function test_add_to_shopping_creates_a_list_item_and_reports_a_mutation(): void
    {
        $out = $this->toolbox->run('add_to_shopping', ['name' => 'Eggs', 'section' => 'dairy'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('shopping_items', ['fridge_id' => $this->fridge->id, 'name' => 'Eggs', 'section' => 'dairy']);
    }

    public function test_add_note_creates_a_note(): void
    {
        $out = $this->toolbox->run('add_note', ['text' => 'leftovers are Toms'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('fridge_notes', ['fridge_id' => $this->fridge->id, 'text' => 'leftovers are Toms', 'user_id' => $this->user->id]);
    }

    public function test_remove_note_previews_without_confirm_then_deletes_with_confirm(): void
    {
        $note = FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'buy milk', 'color' => 'amber']);

        $preview = $this->toolbox->run('remove_note', ['note_id' => $note->id], $this->user, $this->fridge->id);
        $this->assertFalse($preview['mutated']);
        $this->assertStringContainsString('buy milk', $preview['content']);
        $this->assertDatabaseHas('fridge_notes', ['id' => $note->id]);

        $done = $this->toolbox->run('remove_note', ['note_id' => $note->id, 'confirm' => true], $this->user, $this->fridge->id);
        $this->assertTrue($done['mutated']);
        $this->assertDatabaseMissing('fridge_notes', ['id' => $note->id]);
    }

    public function test_remove_note_deletes_by_unique_text_match(): void
    {
        $note = FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'pizza friday', 'color' => 'amber']);

        $byText = $this->toolbox->run('remove_note', ['text' => 'pizza', 'confirm' => true], $this->user, $this->fridge->id);
        $this->assertTrue($byText['mutated']);
        $this->assertDatabaseMissing('fridge_notes', ['id' => $note->id]);
    }

    public function test_remove_note_refuses_to_guess_when_the_text_matches_several(): void
    {
        FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'call the plumber', 'color' => 'amber']);
        FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'call mum', 'color' => 'amber']);

        $out = $this->toolbox->run('remove_note', ['text' => 'call'], $this->user, $this->fridge->id);

        $this->assertFalse($out['mutated']);
        $this->assertStringContainsString('matches 2 notes', $out['content']);
        $this->assertDatabaseCount('fridge_notes', 2);
    }

    public function test_update_item_changes_quantity(): void
    {
        $item = $this->item(['quantity' => 4]);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'quantity' => 2], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame(2, $item->fresh()->quantity);
    }

    public function test_update_item_expiry_date_re_derives_shelf_life_days(): void
    {
        // A stale shelf_life_days from before the edit would make ItemResource's freshness %
        // (what the Guardian tab sorts by) compare the new date against the wrong total.
        $item = $this->item(['expiry_date' => now()->addDay(), 'shelf_life_days' => 1]);

        $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'expiry_date' => now()->addDays(30)->toDateString(),
        ], $this->user, $this->fridge->id);

        $item->refresh();
        $this->assertSame(now()->addDays(30)->toDateString(), $item->expiry_date->toDateString());
        $this->assertSame(30, $item->shelf_life_days);
    }

    public function test_shop_urls_are_stored_listed_and_cleaned(): void
    {
        // add_to_shopping keeps a valid link, drops a bad one.
        $this->toolbox->run('add_to_shopping', ['name' => 'Oat milk', 'shop_url' => 'https://shop.test/oatmilk'], $this->user, $this->fridge->id);
        $this->toolbox->run('add_to_shopping', ['name' => 'Bread', 'shop_url' => 'javascript:alert(1)'], $this->user, $this->fridge->id);

        $this->assertDatabaseHas('shopping_items', ['name' => 'Oat milk', 'shop_url' => 'https://shop.test/oatmilk']);
        $this->assertDatabaseHas('shopping_items', ['name' => 'Bread', 'shop_url' => null]);

        $list = $this->toolbox->run('list_shopping', [], $this->user, $this->fridge->id);
        $this->assertStringContainsString('buy: https://shop.test/oatmilk', $list['content']);

        // update_item sets then clears an item's buy link.
        $item = $this->item();
        $this->toolbox->run('update_item', ['item_id' => $item->id, 'shop_url' => 'https://shop.test/milk'], $this->user, $this->fridge->id);
        $this->assertSame('https://shop.test/milk', $item->fresh()->shop_url);

        $listed = $this->toolbox->run('list_items', [], $this->user, $this->fridge->id);
        $this->assertStringContainsString('buy: https://shop.test/milk', $listed['content']);

        $this->toolbox->run('update_item', ['item_id' => $item->id, 'shop_url' => ''], $this->user, $this->fridge->id);
        $this->assertNull($item->fresh()->shop_url);
    }

    public function test_mark_item_used_deletes_the_item_and_logs_usage(): void
    {
        $item = $this->item(['name' => 'Butter', 'quantity' => 1, 'expiry_date' => now()->addDays(3)]);

        $out = $this->toolbox->run('mark_item_used', ['item_id' => $item->id], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseMissing('items', ['id' => $item->id]);
        $this->assertDatabaseHas('usage_history', ['user_id' => $this->user->id, 'key' => 'butter', 'count' => 1, 'fresh_use_count' => 1]);
    }

    public function test_mark_item_used_with_a_partial_quantity_decrements(): void
    {
        $item = $this->item(['quantity' => 5]);

        $this->toolbox->run('mark_item_used', ['item_id' => $item->id, 'quantity_used' => 2], $this->user, $this->fridge->id);

        $this->assertSame(3, $item->fresh()->quantity);
        $this->assertDatabaseHas('usage_history', ['user_id' => $this->user->id, 'count' => 1]);
    }

    public function test_mark_items_used_matching_marks_every_match_and_logs_each(): void
    {
        $expiringSoon1 = $this->item(['name' => 'Yogurt', 'expiry_date' => now()->addDay()]);
        $expiringSoon2 = $this->item(['name' => 'Cream', 'expiry_date' => now()->addDay()]);
        $notExpiring = $this->item(['name' => 'Rice', 'expiry_date' => now()->addDays(300)]);

        $out = $this->toolbox->run('mark_items_used_matching', ['expiring_within_days' => 2], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame('2', $out['value']);
        $this->assertDatabaseMissing('items', ['id' => $expiringSoon1->id]);
        $this->assertDatabaseMissing('items', ['id' => $expiringSoon2->id]);
        $this->assertDatabaseHas('items', ['id' => $notExpiring->id]);
        $this->assertDatabaseHas('usage_history', ['user_id' => $this->user->id, 'key' => 'yogurt']);
        $this->assertDatabaseHas('usage_history', ['user_id' => $this->user->id, 'key' => 'cream']);
    }

    public function test_mark_items_used_matching_rejects_a_call_with_no_filter(): void
    {
        $this->item(['name' => 'Yogurt']);

        $out = $this->toolbox->run('mark_items_used_matching', [], $this->user, $this->fridge->id);

        $this->assertFalse($out['ok']);
        $this->assertDatabaseHas('items', ['name' => 'Yogurt']);
    }

    public function test_mark_items_used_matching_is_machine_eligible(): void
    {
        $names = collect($this->toolbox->schemas('machine'))->map(fn ($t) => $t['function']['name']);

        $this->assertContains('mark_items_used_matching', $names);
    }

    public function test_remove_item_previews_without_confirm_then_deletes_with_confirm(): void
    {
        $item = $this->item(['name' => 'Ketchup']);

        $preview = $this->toolbox->run('remove_item', ['item_id' => $item->id], $this->user, $this->fridge->id);
        $this->assertFalse($preview['mutated']);
        $this->assertStringContainsString('Ketchup', $preview['content']);
        $this->assertDatabaseHas('items', ['id' => $item->id]);

        $done = $this->toolbox->run('remove_item', ['item_id' => $item->id, 'confirm' => true], $this->user, $this->fridge->id);
        $this->assertTrue($done['mutated']);
        $this->assertDatabaseMissing('items', ['id' => $item->id]);
    }

    public function test_clear_expired_items_previews_then_deletes_only_expired(): void
    {
        $fresh = $this->item(['name' => 'Cheese', 'expiry_date' => now()->addDays(10)]);
        $this->item(['name' => 'Old Cream', 'expiry_date' => now()->subDays(1)]);
        $this->item(['name' => 'Older Eggs', 'expiry_date' => now()->subDays(4)]);

        $preview = $this->toolbox->run('clear_expired_items', [], $this->user, $this->fridge->id);
        $this->assertFalse($preview['mutated']);
        $this->assertStringContainsString('Old Cream', $preview['content']);
        $this->assertDatabaseCount('items', 3);

        $done = $this->toolbox->run('clear_expired_items', ['confirm' => true], $this->user, $this->fridge->id);
        $this->assertTrue($done['mutated']);
        $this->assertDatabaseCount('items', 1);
        $this->assertDatabaseHas('items', ['id' => $fresh->id]);
    }

    public function test_a_bad_item_id_returns_an_error_not_an_exception(): void
    {
        $out = $this->toolbox->run('update_item', ['item_id' => 999999, 'quantity' => 2], $this->user, $this->fridge->id);

        $this->assertStringContainsString('no accessible item', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_list_fridges_shows_the_users_fridges_with_counts(): void
    {
        $this->item();

        $out = $this->toolbox->run('list_fridges', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('Home', $out['content']);
        $this->assertStringContainsString('owner', $out['content']);
        $this->assertStringContainsString('1 item(s)', $out['content']);
    }

    public function test_get_kitchen_score_reports_the_scores(): void
    {
        $this->item(['expiry_date' => now()->subDays(2)]);

        $out = $this->toolbox->run('get_kitchen_score', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('Waste Saver:', $out['content']);
        $this->assertStringContainsString('Tidiness (Organizer):', $out['content']);
        $this->assertStringContainsString('Shopping List (Shopkeeper):', $out['content']);
        $this->assertStringContainsString('Overdue items right now: 1', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_list_badges_shows_earned_and_in_progress_badges(): void
    {
        UserBadge::create([
            'user_id' => $this->user->id,
            'badge_key' => 'first_link_recipe',
            'progress' => 1,
            'earned_at' => now(),
        ]);

        $out = $this->toolbox->run('list_badges', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('✓ Link Master', $out['content']);
        $this->assertStringContainsString('☐ Item Rescuer — 0/10', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_get_credits_balance_reports_the_users_balance(): void
    {
        // ai_credits isn't mass-assignable (see User::$fillable) - forceFill bypasses that.
        $this->user->forceFill(['ai_credits' => 7])->save();

        $out = $this->toolbox->run('get_credits_balance', [], $this->user, $this->fridge->id);

        $this->assertSame('7 AI credits remaining.', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_get_recipe_returns_ingredients_and_steps(): void
    {
        $recipe = Recipe::create([
            'user_id' => $this->user->id, 'name' => 'Omelette', 'minutes' => 10,
            'ingredients' => [['name' => '3 eggs', 'icon' => 'eggs']],
            'steps' => ['Beat the eggs', 'Fry gently'], 'made_count' => 0,
        ]);

        $out = $this->toolbox->run('get_recipe', ['recipe_id' => $recipe->id], $this->user, $this->fridge->id);

        $this->assertStringContainsString('3 eggs', $out['content']);
        $this->assertStringContainsString('1. Beat the eggs', $out['content']);
    }

    public function test_add_item_creates_an_item_with_a_guessed_icon(): void
    {
        $out = $this->toolbox->run('add_item', [
            'name' => 'Cheddar cheese', 'quantity' => 2, 'shelf_life_days' => 14, 'section' => 'Dairy',
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('items', [
            'name' => 'Cheddar cheese', 'icon' => 'cheese', 'nutrition_category' => 'dairy', 'quantity' => 2,
            'shelf_life_days' => 14,
        ]);
        $this->assertDatabaseHas('sections', ['fridge_id' => $this->fridge->id, 'name' => 'Dairy']);
    }

    public function test_add_item_with_an_explicit_expiry_date_derives_shelf_life_days(): void
    {
        // shelf_life_days must actually be persisted (not just used to compute expiry_date and
        // discarded), or ItemResource's freshness % - what the Guardian tab sorts by - can
        // never be computed for this item, and it silently sorts as if it were the most urgent.
        $out = $this->toolbox->run('add_item', [
            'name' => 'Canned beans', 'expiry_date' => now()->addDays(300)->toDateString(),
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $item = Item::where('name', 'Canned beans')->first();
        $this->assertSame(300, $item->shelf_life_days);
    }

    public function test_add_item_matches_the_generated_non_curated_icon_pack(): void
    {
        // "Salmon fillet" isn't in any of the 10 curated keyword lists - proves the guess now
        // reaches the full 164-icon pack instead of falling back to a generic curated guess.
        $out = $this->toolbox->run('add_item', ['name' => 'Salmon fillet'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $item = Item::where('name', 'Salmon fillet')->first();
        $this->assertNotSame('', $item->icon);
        $this->assertNotSame('leftovers', $item->icon);
        $this->assertMatchesRegularExpression('/^icon\d+$/', $item->icon);
    }

    public function test_bulk_add_items_adds_many_in_one_call(): void
    {
        $out = $this->toolbox->run('bulk_add_items', [
            'items' => [
                ['name' => 'Eggs', 'quantity' => 12],
                ['name' => 'Spinach', 'shelf_life_days' => 5, 'location' => 'fridge'],
                ['name' => '', 'quantity' => 1], // skipped, no name
            ],
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('items', ['name' => 'Eggs', 'quantity' => 12]);
        $this->assertDatabaseHas('items', ['name' => 'Spinach', 'icon' => 'spinach']);
        $this->assertSame(2, Item::whereHas('section', fn ($q) => $q->where('fridge_id', $this->fridge->id))->count());
    }

    public function test_update_item_renames_and_recategorises(): void
    {
        $item = $this->item(['name' => 'Mystery box']);

        $out = $this->toolbox->run('update_item', [
            'item_id' => $item->id, 'name' => 'Chicken curry', 'category' => 'protein',
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $fresh = $item->fresh();
        $this->assertSame('Chicken curry', $fresh->name);
        $this->assertSame('protein', $fresh->nutrition_category);
    }

    public function test_update_item_sets_and_clears_the_note(): void
    {
        $item = $this->item();

        $set = $this->toolbox->run('update_item', ['item_id' => $item->id, 'note' => 'for Sunday'], $this->user, $this->fridge->id);
        $this->assertTrue($set['mutated']);
        $this->assertSame('for Sunday', $item->fresh()->note);

        $cleared = $this->toolbox->run('update_item', ['item_id' => $item->id, 'note' => ''], $this->user, $this->fridge->id);
        $this->assertTrue($cleared['mutated']);
        $this->assertSame('', $item->fresh()->note);
    }

    public function test_update_item_rejects_an_unknown_category(): void
    {
        $item = $this->item();

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'category' => 'snacks'], $this->user, $this->fridge->id);

        $this->assertFalse($out['mutated']);
        $this->assertStringContainsString('category must be one of', $out['content']);
    }

    public function test_update_note_edits_the_text(): void
    {
        $note = FridgeNote::create(['fridge_id' => $this->fridge->id, 'user_id' => $this->user->id, 'text' => 'pizza friday', 'color' => 'amber']);

        $out = $this->toolbox->run('update_note', ['note_id' => $note->id, 'text' => 'pizza saturday'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame('pizza saturday', $note->fresh()->text);
    }

    public function test_list_and_forget_facts(): void
    {
        $this->toolbox->run('remember_fact', ['fact' => 'Vegetarian'], $this->user, $this->fridge->id);
        $this->toolbox->run('remember_fact', ['fact' => 'Allergic to peanuts'], $this->user, $this->fridge->id);

        $list = $this->toolbox->run('list_facts', [], $this->user, $this->fridge->id);
        $this->assertStringContainsString('Vegetarian', $list['content']);
        $this->assertStringContainsString('Allergic to peanuts', $list['content']);

        $forget = $this->toolbox->run('forget_fact', ['text' => 'peanut'], $this->user, $this->fridge->id);
        $this->assertTrue($forget['mutated']);
        $this->assertSame(['Vegetarian'], $this->user->fresh()->userMemory->facts);
    }

    public function test_delete_recipe_confirms_first_and_only_touches_your_own(): void
    {
        $mine = Recipe::create([
            'user_id' => $this->user->id, 'name' => 'My Soup', 'minutes' => 20,
            'ingredients' => [['name' => 'x', 'icon' => 'leftovers']], 'steps' => ['boil'], 'made_count' => 0,
        ]);
        $curated = Recipe::create([
            'user_id' => null, 'name' => 'Curated Stew', 'minutes' => 30,
            'ingredients' => [['name' => 'y', 'icon' => 'leftovers']], 'steps' => ['simmer'], 'made_count' => 0,
        ]);

        $curatedTry = $this->toolbox->run('delete_recipe', ['recipe_id' => $curated->id, 'confirm' => true], $this->user, $this->fridge->id);
        $this->assertFalse($curatedTry['mutated']);
        $this->assertDatabaseHas('recipes', ['id' => $curated->id]);

        $preview = $this->toolbox->run('delete_recipe', ['recipe_id' => $mine->id], $this->user, $this->fridge->id);
        $this->assertFalse($preview['mutated']);
        $this->assertDatabaseHas('recipes', ['id' => $mine->id]);

        $done = $this->toolbox->run('delete_recipe', ['recipe_id' => $mine->id, 'confirm' => true], $this->user, $this->fridge->id);
        $this->assertTrue($done['mutated']);
        $this->assertDatabaseMissing('recipes', ['id' => $mine->id]);
    }

    public function test_add_item_falls_back_to_the_first_section_when_none_named(): void
    {
        $out = $this->toolbox->run('add_item', ['name' => 'Mystery jar'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $item = Item::where('name', 'Mystery jar')->first();
        $this->assertSame($this->section->id, $item->section_id);
        // No keyword anywhere matches "Mystery jar" - left blank (not a fake real key like
        // 'leftovers') so the frontend's own name-based re-guess gets a chance to run.
        $this->assertSame('', $item->icon);
    }

    public function test_move_item_changes_its_section(): void
    {
        $item = $this->item();

        $out = $this->toolbox->run('move_item', ['item_id' => $item->id, 'section' => 'Door', 'location' => 'freezer'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $fresh = $item->fresh();
        $this->assertSame('freezer', $fresh->location);
        $this->assertSame('Door', $fresh->section->name);
    }

    public function test_check_off_and_remove_from_shopping(): void
    {
        $this->toolbox->run('add_to_shopping', ['name' => 'Bananas'], $this->user, $this->fridge->id);

        $checked = $this->toolbox->run('check_off_shopping', ['name' => 'banana'], $this->user, $this->fridge->id);
        $this->assertTrue($checked['mutated']);
        $this->assertDatabaseHas('shopping_items', ['name' => 'Bananas', 'checked' => true]);

        $removed = $this->toolbox->run('remove_from_shopping', ['name' => 'banana'], $this->user, $this->fridge->id);
        $this->assertTrue($removed['mutated']);
        $this->assertDatabaseMissing('shopping_items', ['name' => 'Bananas']);
    }

    public function test_remember_fact_appends_and_dedupes(): void
    {
        $this->toolbox->run('remember_fact', ['fact' => 'Vegetarian'], $this->user, $this->fridge->id);
        $dupe = $this->toolbox->run('remember_fact', ['fact' => 'vegetarian'], $this->user, $this->fridge->id);

        $this->assertStringContainsString('Already remembered', $dupe['content']);
        $this->assertSame(['Vegetarian'], $this->user->userMemory()->first()->facts);
    }

    public function test_save_recipe_creates_a_recipe(): void
    {
        $out = $this->toolbox->run('save_recipe', [
            'name' => 'Fried Rice', 'minutes' => 15,
            'ingredients' => ['2 cups rice', '2 eggs'], 'steps' => ['Cook rice', 'Fry with egg'],
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $recipe = $this->user->recipes()->first();
        $this->assertSame('Fried Rice', $recipe->name);
        $this->assertSame('eggs', $recipe->ingredients[1]['icon']);
    }

    public function test_save_recipe_rejects_an_incomplete_recipe(): void
    {
        $out = $this->toolbox->run('save_recipe', ['name' => 'Nothing', 'minutes' => 5, 'ingredients' => [], 'steps' => []], $this->user, $this->fridge->id);

        $this->assertFalse($out['mutated']);
        $this->assertStringContainsString('at least one ingredient', $out['content']);
    }

    public function test_mark_recipe_made_increments_the_count(): void
    {
        $recipe = Recipe::create([
            'user_id' => $this->user->id, 'name' => 'Soup', 'minutes' => 30,
            'ingredients' => [['name' => 'stock', 'icon' => 'leftovers']], 'steps' => ['Simmer'], 'made_count' => 0,
        ]);

        $out = $this->toolbox->run('mark_recipe_made', ['recipe_id' => $recipe->id], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame(1, $recipe->fresh()->made_count);
        $this->assertStringContainsString('Logged that you made "Soup" (1x now).', $out['content']);
    }

    public function test_mark_recipe_made_works_on_the_machine_surface(): void
    {
        $recipe = Recipe::create([
            'user_id' => $this->user->id, 'name' => 'Soup', 'minutes' => 30,
            'ingredients' => [['name' => 'stock', 'icon' => 'leftovers']], 'steps' => ['Simmer'], 'made_count' => 0,
        ]);

        $out = $this->toolbox->run('mark_recipe_made', ['recipe_id' => $recipe->id], $this->user, $this->fridge->id, 'machine');

        $this->assertTrue($out['ok']);
        $this->assertSame(1, $recipe->fresh()->made_count);
    }

    // ---- weight / calories / custom_fields ------------------------------------------------

    public function test_list_items_shows_weight_and_calories_per_unit(): void
    {
        $this->item(['name' => 'Yogurt', 'quantity' => 1, 'weight' => 500, 'weight_unit' => 'g', 'calories' => 240]);
        $this->item(['name' => 'Butter', 'quantity' => 3, 'weight' => 250, 'weight_unit' => 'g', 'calories' => 720]);

        $out = $this->toolbox->run('list_items', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('500g · 240 kcal', $out['content']);
        $this->assertStringContainsString('250g each · 720 kcal each', $out['content']);
    }

    public function test_list_items_shows_compact_custom_fields_capped(): void
    {
        $fields = [];
        for ($i = 1; $i <= 7; $i++) {
            $fields[] = ['id' => (string) Str::uuid(), 'label' => "Field {$i}", 'value' => "Value {$i}"];
        }
        $this->item(['name' => 'Flour', 'custom_fields' => $fields]);

        $out = $this->toolbox->run('list_items', [], $this->user, $this->fridge->id);

        $this->assertStringContainsString('Field 1=Value 1', $out['content']);
        $this->assertStringContainsString('Field 5=Value 5', $out['content']);
        $this->assertStringNotContainsString('Field 6=', $out['content']);
        $this->assertStringContainsString('(+2 more)', $out['content']);
    }

    public function test_list_items_filters_by_fridge_id_and_ignores_foreign_fridge(): void
    {
        $this->item(['name' => 'Home Milk']);
        $otherFridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Cabin']);
        $otherSection = Section::create(['fridge_id' => $otherFridge->id, 'name' => 'Fridge']);
        Item::create(['section_id' => $otherSection->id, 'name' => 'Cabin Milk', 'icon' => 'milk', 'quantity' => 1]);

        $home = $this->toolbox->run('list_items', ['fridge_id' => $this->fridge->id], $this->user, $this->fridge->id);
        $this->assertStringContainsString('Home Milk', $home['content']);
        $this->assertStringNotContainsString('Cabin Milk', $home['content']);

        // A fridge_id the user doesn't belong to is ignored, not leaked as a filter or an error.
        $stranger = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Not Mine']);
        $ignored = $this->toolbox->run('list_items', ['fridge_id' => $stranger->id], $this->user, $this->fridge->id);
        $this->assertStringContainsString('Home Milk', $ignored['content']);
    }

    public function test_update_item_sets_weight_with_unit(): void
    {
        $item = $this->item(['name' => 'Cheese']);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'weight' => 0.75, 'weight_unit' => 'kg'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame(0.75, $item->fresh()->weight);
        $this->assertSame('kg', $item->fresh()->weight_unit);
        $this->assertStringContainsString('weight=0.75kg', $out['content']);
    }

    public function test_update_item_rejects_weight_without_unit(): void
    {
        $item = $this->item(['name' => 'Cheese']);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'weight' => 5], $this->user, $this->fridge->id);

        $this->assertStringStartsWith('Error:', $out['content']);
        $this->assertFalse($out['mutated']);
        $this->assertNull($item->fresh()->weight);
    }

    public function test_update_item_rejects_unknown_weight_unit(): void
    {
        $item = $this->item(['name' => 'Cheese']);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'weight' => 5, 'weight_unit' => 'stone'], $this->user, $this->fridge->id);

        $this->assertStringStartsWith('Error:', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_update_item_clearing_weight_clears_unit(): void
    {
        $item = $this->item(['name' => 'Cheese', 'weight' => 500, 'weight_unit' => 'g']);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'weight' => null], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertNull($item->fresh()->weight);
        $this->assertNull($item->fresh()->weight_unit);
        $this->assertStringContainsString('weight=cleared', $out['content']);
    }

    public function test_update_item_rejects_unit_alone_when_no_weight(): void
    {
        $item = $this->item(['name' => 'Cheese']);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'weight_unit' => 'g'], $this->user, $this->fridge->id);

        $this->assertStringStartsWith('Error:', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_update_item_sets_and_clears_calories(): void
    {
        $item = $this->item(['name' => 'Cheese']);

        $set = $this->toolbox->run('update_item', ['item_id' => $item->id, 'calories' => 350], $this->user, $this->fridge->id);
        $this->assertTrue($set['mutated']);
        $this->assertSame(350, $item->fresh()->calories);

        $cleared = $this->toolbox->run('update_item', ['item_id' => $item->id, 'calories' => null], $this->user, $this->fridge->id);
        $this->assertTrue($cleared['mutated']);
        $this->assertNull($item->fresh()->calories);

        $rejected = $this->toolbox->run('update_item', ['item_id' => $item->id, 'calories' => 999999], $this->user, $this->fridge->id);
        $this->assertStringStartsWith('Error:', $rejected['content']);
    }

    public function test_update_item_upserts_custom_field_by_label_without_clobbering_others(): void
    {
        $item = $this->item(['name' => 'Flour', 'custom_fields' => [
            ['id' => 'a', 'label' => 'Batch code', 'value' => 'L4471-09'],
            ['id' => 'b', 'label' => 'Supplier', 'value' => 'Metro'],
        ]]);

        $out = $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'set_custom_fields' => [['label' => 'batch code', 'value' => 'L4471-10']],
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $fields = collect($item->fresh()->custom_fields)->keyBy('label');
        $this->assertSame('L4471-10', $fields['Batch code']['value']);
        $this->assertSame('a', $fields['Batch code']['id']);
        $this->assertSame('Metro', $fields['Supplier']['value']);
        $this->assertSame('b', $fields['Supplier']['id']);
    }

    public function test_update_item_appends_new_custom_field_with_uuid(): void
    {
        $item = $this->item(['name' => 'Flour']);

        $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'set_custom_fields' => [['label' => 'Batch code', 'value' => 'L4471-09']],
        ], $this->user, $this->fridge->id);

        $fields = $item->fresh()->custom_fields;
        $this->assertCount(1, $fields);
        $this->assertNotEmpty($fields[0]['id']);
        $this->assertSame('Batch code', $fields[0]['label']);
    }

    public function test_update_item_empty_value_removes_custom_field(): void
    {
        $item = $this->item(['name' => 'Flour', 'custom_fields' => [
            ['id' => 'a', 'label' => 'Batch code', 'value' => 'L4471-09'],
        ]]);

        $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'set_custom_fields' => [['label' => 'Batch code', 'value' => '']],
        ], $this->user, $this->fridge->id);

        $this->assertSame([], $item->fresh()->custom_fields);
    }

    public function test_update_item_custom_field_limits_are_enforced(): void
    {
        $item = $this->item(['name' => 'Flour']);

        $tooManyEdits = array_map(fn ($i) => ['label' => "Field {$i}", 'value' => 'x'], range(1, 21));
        $tooMany = $this->toolbox->run('update_item', ['item_id' => $item->id, 'set_custom_fields' => $tooManyEdits], $this->user, $this->fridge->id);
        $this->assertStringStartsWith('Error:', $tooMany['content']);
        $this->assertSame([], $item->fresh()->custom_fields ?? []);

        $longLabel = $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'set_custom_fields' => [['label' => str_repeat('a', 41), 'value' => 'x']],
        ], $this->user, $this->fridge->id);
        $this->assertStringStartsWith('Error:', $longLabel['content']);

        $longValue = $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'set_custom_fields' => [['label' => 'Note', 'value' => str_repeat('a', 256)]],
        ], $this->user, $this->fridge->id);
        $this->assertStringStartsWith('Error:', $longValue['content']);
    }

    public function test_update_item_confirmation_renders_weight_and_fields_readably(): void
    {
        $item = $this->item(['name' => 'Flour']);

        $out = $this->toolbox->run('update_item', [
            'item_id' => $item->id,
            'weight' => 1,
            'weight_unit' => 'kg',
            'set_custom_fields' => [['label' => 'Batch code', 'value' => 'L4471-09']],
        ], $this->user, $this->fridge->id);

        $this->assertStringNotContainsString('Array', $out['content']);
        $this->assertStringContainsString('weight=1kg', $out['content']);
        $this->assertStringContainsString('Batch code=L4471-09', $out['content']);
    }

    public function test_add_item_accepts_weight_calories(): void
    {
        $out = $this->toolbox->run('add_item', [
            'name' => 'Yogurt', 'weight' => 500, 'weight_unit' => 'g', 'calories' => 240,
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('items', ['name' => 'Yogurt', 'weight' => 500, 'weight_unit' => 'g', 'calories' => 240]);
        $this->assertStringContainsString('500g', $out['content']);
        $this->assertStringContainsString('240 kcal', $out['content']);

        $rejected = $this->toolbox->run('add_item', ['name' => 'Butter', 'weight' => 250], $this->user, $this->fridge->id);
        $this->assertStringStartsWith('Error:', $rejected['content']);
    }

    public function test_bulk_add_items_skips_entry_with_weight_but_no_unit(): void
    {
        $out = $this->toolbox->run('bulk_add_items', [
            'items' => [
                ['name' => 'Milk', 'weight' => 1, 'weight_unit' => 'l'],
                ['name' => 'Butter', 'weight' => 250], // no unit - should be skipped, not fatal
            ],
        ], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('items', ['name' => 'Milk', 'weight' => 1, 'weight_unit' => 'l']);
        $this->assertDatabaseMissing('items', ['name' => 'Butter']);
        $this->assertStringContainsString('Milk', $out['content']);
        $this->assertStringContainsString('Skipped', $out['content']);
        $this->assertStringContainsString('Butter', $out['content']);
    }

    // ---- sum_item_field ---------------------------------------------------------------

    public function test_sum_item_field_sums_quantity(): void
    {
        $this->item(['name' => 'Milk', 'quantity' => 2]);
        $this->item(['name' => 'Eggs', 'quantity' => 12]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'quantity'], $this->user, $this->fridge->id);

        $this->assertTrue($out['ok']);
        $this->assertSame('14', $out['value']);
        $this->assertStringContainsString('Total quantity: 14 across 2 items', $out['content']);
    }

    public function test_sum_item_field_sums_calories_multiplied_by_quantity_and_skips_unset(): void
    {
        $this->item(['name' => 'Yogurt', 'quantity' => 3, 'calories' => 100]);
        $this->item(['name' => 'Mystery', 'quantity' => 1]); // no calories set

        $out = $this->toolbox->run('sum_item_field', ['field' => 'calories'], $this->user, $this->fridge->id);

        $this->assertSame('300 kcal', $out['value']);
        $this->assertStringContainsString('Total calories: 300 kcal across 1 item', $out['content']);
        $this->assertStringContainsString('1 skipped', $out['content']);
    }

    public function test_sum_item_field_sums_weight_in_target_unit_and_never_mixes_mass_and_volume(): void
    {
        $this->item(['name' => 'Flour', 'quantity' => 2, 'weight' => 500, 'weight_unit' => 'g']);
        $this->item(['name' => 'Sugar', 'quantity' => 1, 'weight' => 1, 'weight_unit' => 'kg']);
        $this->item(['name' => 'Milk', 'quantity' => 1, 'weight' => 1, 'weight_unit' => 'l']); // volume - excluded from a mass sum

        $out = $this->toolbox->run('sum_item_field', ['field' => 'weight', 'unit' => 'kg'], $this->user, $this->fridge->id);

        // 2x500g = 1000g = 1kg, plus 1x1kg = 1kg -> 2kg total; the 1l milk is skipped.
        $this->assertSame('2kg', $out['value']);
        $this->assertStringContainsString('across 2 items', $out['content']);
        $this->assertStringContainsString('1 skipped', $out['content']);
    }

    public function test_sum_item_field_rejects_unknown_field(): void
    {
        $out = $this->toolbox->run('sum_item_field', ['field' => 'price'], $this->user, $this->fridge->id);

        $this->assertFalse($out['ok']);
        $this->assertStringStartsWith('Error:', $out['content']);
    }

    public function test_sum_item_field_rejects_weight_without_a_valid_unit(): void
    {
        $this->item(['name' => 'Flour', 'weight' => 500, 'weight_unit' => 'g']);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'weight', 'unit' => 'stone'], $this->user, $this->fridge->id);

        $this->assertFalse($out['ok']);
    }

    public function test_sum_item_field_respects_list_items_style_filters(): void
    {
        $this->item(['name' => 'Fresh Milk', 'quantity' => 1, 'expiry_date' => now()->addDays(10)]);
        $this->item(['name' => 'Old Milk', 'quantity' => 1, 'expiry_date' => now()->subDays(2)]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'quantity', 'expired_only' => true], $this->user, $this->fridge->id);

        $this->assertSame('1', $out['value']);
    }

    public function test_sum_item_field_sums_a_custom_field_multiplied_by_quantity(): void
    {
        $this->item(['name' => 'Flour', 'quantity' => 2, 'custom_fields' => [
            ['id' => 'a', 'label' => 'Cost', 'value' => '2.50'],
        ]]);
        $this->item(['name' => 'Sugar', 'quantity' => 1, 'custom_fields' => [
            ['id' => 'b', 'label' => 'Cost', 'value' => '1.00'],
        ]]);
        $this->item(['name' => 'No cost set', 'quantity' => 1]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Cost'], $this->user, $this->fridge->id);

        $this->assertTrue($out['ok']);
        $this->assertSame('6', $out['value']); // 2 x 2.50 + 1 x 1.00
        $this->assertStringContainsString('Total "Cost": 6 across 2 items', $out['content']);
        $this->assertStringContainsString('1 skipped', $out['content']);
    }

    public function test_sum_item_field_custom_field_matches_the_label_case_insensitively(): void
    {
        $this->item(['name' => 'Flour', 'quantity' => 1, 'custom_fields' => [
            ['id' => 'a', 'label' => 'cost', 'value' => '5'],
        ]]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Cost'], $this->user, $this->fridge->id);

        $this->assertSame('5', $out['value']);
    }

    public function test_sum_item_field_custom_field_skips_non_numeric_values(): void
    {
        $this->item(['name' => 'Flour', 'quantity' => 1, 'custom_fields' => [
            ['id' => 'a', 'label' => 'Cost', 'value' => 'unknown'],
        ]]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Cost'], $this->user, $this->fridge->id);

        $this->assertSame('0', $out['value']);
        $this->assertStringContainsString('1 skipped', $out['content']);
    }

    public function test_sum_item_field_rejects_custom_without_a_custom_field_label(): void
    {
        $out = $this->toolbox->run('sum_item_field', ['field' => 'custom'], $this->user, $this->fridge->id);

        $this->assertFalse($out['ok']);
        $this->assertStringStartsWith('Error:', $out['content']);
    }

    // ---- notify_user ------------------------------------------------------------------

    public function test_notify_user_creates_a_notification_event(): void
    {
        $out = $this->toolbox->run('notify_user', ['message' => 'Expiring soon: 3 items'], $this->user, $this->fridge->id, 'machine');

        $this->assertTrue($out['mutated']);
        $this->assertDatabaseHas('notification_events', [
            'fridge_id' => $this->fridge->id,
            'user_id' => $this->user->id,
            'kind' => 'machine',
            'message' => 'Expiring soon: 3 items',
        ]);
    }

    public function test_notify_user_requires_a_message(): void
    {
        $out = $this->toolbox->run('notify_user', [], $this->user, $this->fridge->id, 'machine');

        $this->assertStringStartsWith('Error:', $out['content']);
        $this->assertFalse($out['mutated']);
    }

    public function test_notify_user_is_not_available_on_the_chat_surface(): void
    {
        $out = $this->toolbox->run('notify_user', ['message' => 'hi'], $this->user, $this->fridge->id, 'chat');

        $this->assertFalse($out['ok']);
        $this->assertDatabaseMissing('notification_events', ['message' => 'hi']);
    }

    // ---- machine-surface eligibility ---------------------------------------------------

    public function test_schemas_excludes_notify_user_from_chat_and_includes_it_for_machine(): void
    {
        $chatNames = collect($this->toolbox->schemas('chat'))->map(fn ($t) => $t['function']['name']);
        $machineNames = collect($this->toolbox->schemas('machine'))->map(fn ($t) => $t['function']['name']);

        $this->assertNotContains('notify_user', $chatNames);
        $this->assertContains('notify_user', $machineNames);
    }

    public function test_schemas_on_machine_surface_excludes_destructive_and_item_id_targeted_tools(): void
    {
        $machineNames = collect($this->toolbox->schemas('machine'))->map(fn ($t) => $t['function']['name']);

        foreach (['remove_item', 'remove_note', 'clear_expired_items', 'delete_recipe', 'remove_from_shopping', 'forget_fact', 'update_item', 'move_item', 'mark_item_used', 'fetch_url', 'import_recipe_from_link'] as $excluded) {
            $this->assertNotContains($excluded, $machineNames, "{$excluded} should not be Machine-eligible");
        }

        foreach (['list_items', 'sum_item_field', 'notify_user', 'add_to_shopping', 'add_note', 'add_item', 'bulk_add_items', 'get_kitchen_score', 'list_shopping', 'mark_recipe_made'] as $included) {
            $this->assertContains($included, $machineNames, "{$included} should be Machine-eligible");
        }
    }

    public function test_run_refuses_a_disallowed_tool_on_the_machine_surface_even_if_named_directly(): void
    {
        $item = $this->item(['name' => 'Milk']);

        // Simulates a hand-edited/tampered Machine step naming a non-eligible tool - schema
        // filtering alone wouldn't catch this, since it never goes through schemas().
        $out = $this->toolbox->run('remove_item', ['item_id' => $item->id, 'confirm' => true], $this->user, $this->fridge->id, 'machine');

        $this->assertFalse($out['ok']);
        $this->assertFalse($out['mutated']);
        $this->assertDatabaseHas('items', ['id' => $item->id]);
    }

    public function test_run_allows_a_machine_eligible_tool_on_the_machine_surface(): void
    {
        $this->item(['name' => 'Milk', 'quantity' => 2]);

        $out = $this->toolbox->run('sum_item_field', ['field' => 'quantity'], $this->user, $this->fridge->id, 'machine');

        $this->assertTrue($out['ok']);
    }
}
