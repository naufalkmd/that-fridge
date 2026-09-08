<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use App\Services\AgentToolbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_update_item_changes_quantity(): void
    {
        $item = $this->item(['quantity' => 4]);

        $out = $this->toolbox->run('update_item', ['item_id' => $item->id, 'quantity' => 2], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $this->assertSame(2, $item->fresh()->quantity);
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
        $this->assertStringContainsString('Overdue items right now: 1', $out['content']);
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
        ]);
        $this->assertDatabaseHas('sections', ['fridge_id' => $this->fridge->id, 'name' => 'Dairy']);
    }

    public function test_add_item_falls_back_to_the_first_section_when_none_named(): void
    {
        $out = $this->toolbox->run('add_item', ['name' => 'Mystery jar'], $this->user, $this->fridge->id);

        $this->assertTrue($out['mutated']);
        $item = Item::where('name', 'Mystery jar')->first();
        $this->assertSame($this->section->id, $item->section_id);
        $this->assertSame('leftovers', $item->icon);
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
    }
}
