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

    public function test_store_returns_the_added_timestamp(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
        ]);

        $response->assertStatus(201);
        $this->assertNotNull($response->json('data.added'));
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

    public function test_store_accepts_and_returns_a_shop_url(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
            'shop_url' => 'https://example.com/milk',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['shop_url' => 'https://example.com/milk']]);
        $this->assertDatabaseHas('items', ['name' => 'Milk', 'shop_url' => 'https://example.com/milk']);
    }

    public function test_store_rejects_an_invalid_shop_url(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
            'shop_url' => 'not a url',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('shop_url');
    }

    public function test_update_can_set_and_clear_the_shop_url(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Milk', 'icon' => 'milk']);

        $setResponse = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['shop_url' => 'https://example.com/milk']);
        $setResponse->assertStatus(200);
        $setResponse->assertJson(['data' => ['shop_url' => 'https://example.com/milk']]);

        $clearResponse = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['shop_url' => null]);
        $clearResponse->assertStatus(200);
        $clearResponse->assertJson(['data' => ['shop_url' => null]]);
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

    public function test_marking_an_item_opened_stamps_opened_at(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create([
            'name' => 'Jam',
            'icon' => 'jam',
            'expiry_date' => now()->addDays(60)->toDateString(),
        ]);

        $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['opened' => true])->assertStatus(200);

        $this->assertNotNull($item->fresh()->opened_at);
    }

    public function test_an_opened_items_days_left_counts_down_instead_of_freezing(): void
    {
        // Regression test for a bug where an opened item's "days left" was recomputed as
        // min(realDaysLeft, 3) on every request with no anchor to when it was opened - so an
        // item with more than 3 days of real shelf life left showed a frozen "3 days left" for
        // as long as that remained true, instead of counting down 3, 2, 1, 0.
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create([
            'name' => 'Jam',
            'icon' => 'jam',
            'expiry_date' => now()->addDays(60)->toDateString(),
        ]);
        // opened_at isn't client-settable (not in Item's #[Fillable]) - stamp it via the
        // observer, then backdate it directly the way only the observer itself would.
        $item->forceFill(['opened' => true])->save();
        $item->forceFill(['opened_at' => now()->subDays(2)])->save();

        // No standalone GET /items/{item} route exists - a no-op-ish PATCH is the cheapest way
        // to get ItemResource's computed `days` back over the API.
        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['note' => 'checked']);

        $this->assertSame(1, $response->json('data.days'));
    }

    public function test_clearing_opened_also_clears_opened_at(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Jam', 'icon' => 'jam']);
        $item->forceFill(['opened' => true])->save();
        $this->assertNotNull($item->fresh()->opened_at);

        $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['opened' => false])->assertStatus(200);

        $this->assertNull($item->fresh()->opened_at);
    }

    public function test_update_accepts_weight_and_unit_together(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'weight' => 12.75,
            'weight_unit' => 'oz',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['weight' => 12.75, 'weight_unit' => 'oz']]);
        $this->assertSame(12.75, $item->fresh()->weight);
        $this->assertSame('oz', $item->fresh()->weight_unit);
    }

    public function test_update_rejects_weight_without_a_unit(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['weight' => 5]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('weight_unit');
    }

    public function test_update_rejects_an_unknown_weight_unit(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'weight' => 5,
            'weight_unit' => 'stone',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('weight_unit');
    }

    public function test_clearing_weight_also_clears_the_unit(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt', 'weight' => 500, 'weight_unit' => 'g']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['weight' => null]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['weight' => null, 'weight_unit' => null]]);
    }

    public function test_update_accepts_calories(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['calories' => 180]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['calories' => 180]]);
    }

    public function test_update_rejects_a_calorie_count_outside_the_sane_range(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['calories' => 200000]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('calories');
    }

    public function test_custom_fields_are_assigned_ids_and_returned(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'custom_fields' => [['label' => 'Batch code', 'value' => 'L4471-09']],
        ]);

        $response->assertStatus(200);
        $fields = $response->json('data.custom_fields');
        $this->assertCount(1, $fields);
        $this->assertSame('Batch code', $fields[0]['label']);
        $this->assertSame('L4471-09', $fields[0]['value']);
        $this->assertNotEmpty($fields[0]['id']);
    }

    public function test_custom_fields_preserve_a_supplied_id_across_updates(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $first = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'custom_fields' => [['label' => 'Batch code', 'value' => 'L4471-09']],
        ]);
        $id = $first->json('data.custom_fields.0.id');

        $second = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'custom_fields' => [['id' => $id, 'label' => 'Batch code', 'value' => 'L4471-10']],
        ]);

        $second->assertStatus(200);
        $this->assertSame($id, $second->json('data.custom_fields.0.id'));
        $this->assertSame('L4471-10', $second->json('data.custom_fields.0.value'));
    }

    public function test_custom_fields_reject_more_than_twenty_entries(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $fields = array_map(fn ($i) => ['label' => "Field {$i}", 'value' => 'x'], range(1, 21));

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['custom_fields' => $fields]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('custom_fields');
    }

    public function test_custom_fields_reject_a_label_over_forty_characters(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt']);

        $response = $this->actingAs($user)->patchJson("/api/items/{$item->id}", [
            'custom_fields' => [['label' => str_repeat('a', 41), 'value' => 'x']],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('custom_fields.0.label');
    }

    public function test_store_accepts_weight_calories_and_custom_fields(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Yogurt',
            'icon' => 'yogurt',
            'weight' => 500,
            'weight_unit' => 'g',
            'calories' => 180,
            'custom_fields' => [['label' => 'Batch code', 'value' => 'L4471-09']],
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['weight' => 500, 'weight_unit' => 'g', 'calories' => 180]]);
        $this->assertCount(1, $response->json('data.custom_fields'));
    }
}
