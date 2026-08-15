<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_store_accepts_a_valid_nutrition_category(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
            'nutrition_category' => 'dairy',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['nutrition_category' => 'dairy']]);
        $this->assertDatabaseHas('items', ['name' => 'Milk', 'nutrition_category' => 'dairy']);
    }

    public function test_store_rejects_an_invalid_nutrition_category(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
            'nutrition_category' => 'carbs',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('nutrition_category');
    }

    public function test_store_allows_omitting_nutrition_category(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Mystery Item',
            'icon' => 'leftovers',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['nutrition_category' => null]]);
    }

    public function test_update_can_change_nutrition_category(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Soup', 'icon' => 'leftovers', 'nutrition_category' => 'other_extras']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'nutrition_category' => 'protein',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['nutrition_category' => 'protein']]);
        $this->assertDatabaseHas('items', ['id' => $item->id, 'nutrition_category' => 'protein']);
    }
}
