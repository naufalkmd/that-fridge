<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use App\Support\ItemFreshness;
use App\Support\OpenedShelfLife;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OpenedShelfLifeTest extends TestCase
{
    use RefreshDatabase;

    public function test_name_rules_distinguish_foods_and_packaging(): void
    {
        $cases = [
            ['Eggplant', 'vegetables', false, null],
            ['Egg noodles', 'grains', true, 180],
            ['Liquid egg', 'protein', true, 3],
            ['Eggs', 'protein', false, null],
            ['Apple', 'fruit', false, null],
            ['Apple juice', 'fruit', true, 7],
            ['Canned peaches', 'fruit', true, 3],
            ['Cooked leftovers', 'other_extras', false, null],
            ['Jam', 'other_extras', true, 30],
            ['Milk', 'dairy', true, 7],
        ];

        foreach ($cases as [$name, $group, $openable, $days]) {
            $resolved = OpenedShelfLife::resolve($name, null, 'fridge', $group);
            $this->assertSame($openable, $resolved['openable'], $name);
            $this->assertSame($days, $resolved['days'], $name);
        }
    }

    public function test_opening_snapshot_printed_ceiling_and_seal_again(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $item = $section->items()->create([
            'name' => 'Jam', 'icon' => 'jam', 'nutrition_category' => 'other_extras',
            'expiry_date' => now()->addDays(5)->toDateString(),
        ]);

        $opened = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['opened' => true])->assertOk();
        $opened->assertJsonPath('data.openable', true);
        $opened->assertJsonPath('data.opened_shelf_life_days', 30);
        $opened->assertJsonPath('data.days', 5);

        $item = $item->fresh();
        $item->forceFill(['name' => 'Milk'])->saveQuietly();
        $this->assertSame(30, $item->fresh()->opened_shelf_life_days);
        $this->assertSame(5, ItemFreshness::effectiveDaysUntilExpiry($item->fresh()));

        $this->patchJson("/api/items/{$item->id}", ['opened' => false])->assertOk();
        $this->assertNull($item->fresh()->opened_at);
        $this->assertNull($item->fresh()->opened_shelf_life_days);
    }

    public function test_unopenable_food_is_rejected_and_dairy_estimate_only_shortens(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $apple = $section->items()->create(['name' => 'Apple', 'icon' => 'apple', 'nutrition_category' => 'fruit']);
        $milk = $section->items()->create(['name' => 'Milk', 'icon' => 'milk', 'nutrition_category' => 'dairy']);

        $this->actingAs($user)->patchJson("/api/items/{$apple->id}", ['opened' => true])
            ->assertStatus(422)->assertJsonValidationErrors('opened');
        $this->patchJson("/api/items/{$milk->id}", ['opened' => true])->assertOk();
        $this->patchJson("/api/items/{$milk->id}", ['opened_shelf_life_days' => 8])->assertStatus(422);
        $this->patchJson("/api/items/{$milk->id}", ['opened_shelf_life_days' => 5])
            ->assertOk()->assertJsonPath('data.opened_shelf_life_source', 'user');
    }

    public function test_opened_countdown_decreases_and_legacy_row_gets_stable_anchor(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $item = $section->items()->create(['name' => 'Milk', 'icon' => 'milk']);
        $item->forceFill(['opened' => true, 'opened_at' => null, 'opened_shelf_life_days' => null])->saveQuietly();

        $this->assertSame(7, ItemFreshness::effectiveDaysUntilExpiry($item));
        $this->assertNotNull($item->fresh()->opened_at);
        $this->travel(2)->days();
        $this->assertSame(5, ItemFreshness::effectiveDaysUntilExpiry($item->fresh()));
    }
}
