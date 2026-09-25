<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
        // Opening duration is anchored to opened_at rather than recalculated on every read.
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

        $this->assertSame(28, $response->json('data.days'));
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

    // ---- autofill: local food-group classification --------------------------------------

    public function test_autofill_resolves_category_locally_without_spending_a_credit_when_its_the_only_missing_field(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        $item = Item::create([
            'section_id' => $section->id, 'name' => 'Whole milk', 'icon' => 'milk', 'quantity' => 1,
            'weight' => 1, 'weight_unit' => 'l', 'calories' => 500, 'expiry_date' => now()->addDays(7),
        ]);
        Http::fake();

        $response = $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill");

        $response->assertStatus(200);
        $response->assertJson(['fields' => ['nutrition_category' => 'dairy']]);
        Http::assertNothingSent();
        $this->assertSame(5, $user->fresh()->ai_credits);
    }

    public function test_autofill_spends_a_credit_and_uses_the_ai_answer_when_category_cant_be_classified_locally(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        // Not classifiable by any local rule, and weight/calories/expiry are all missing too
        // - the combined AI call is unavoidable, and since local genuinely couldn't resolve
        // category, the AI's own valid answer for it is used, same as every other field.
        $item = Item::create(['section_id' => $section->id, 'name' => 'Blorpaccino Deluxe', 'icon' => 'placeholder', 'quantity' => 1]);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'weight' => 1, 'weight_unit' => 'l', 'calories' => 300,
                'shelf_life_days' => 10, 'nutrition_category' => 'other_extras',
            ])]]],
        ], 200)]);

        $response = $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill");

        $response->assertStatus(200);
        $response->assertJson(['fields' => [
            'weight' => 1.0, 'weight_unit' => 'l', 'calories' => 300, 'nutrition_category' => 'other_extras',
        ]]);
        $this->assertSame(4, $user->fresh()->ai_credits);
    }

    public function test_autofill_does_not_let_a_locally_resolved_category_be_overridden_by_the_ai(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        // "Oat milk" resolves locally to other_extras; weight/calories/expiry are still
        // missing so the AI call happens anyway (for those), but its own (deliberately
        // different) category guess must be ignored since local already resolved this field.
        $item = Item::create(['section_id' => $section->id, 'name' => 'Oat milk', 'icon' => 'placeholder', 'quantity' => 1]);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'weight' => 1, 'weight_unit' => 'l', 'calories' => 300,
                'shelf_life_days' => 10, 'nutrition_category' => 'dairy',
            ])]]],
        ], 200)]);

        $response = $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill");

        $response->assertStatus(200);
        $response->assertJson(['fields' => ['nutrition_category' => 'other_extras']]);
        $this->assertSame(4, $user->fresh()->ai_credits);
    }

    public function test_autofill_refunds_when_nothing_can_be_classified_and_nothing_else_is_needed(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        $item = Item::create([
            'section_id' => $section->id, 'name' => 'Xyzzy Widget 9000', 'icon' => 'placeholder', 'quantity' => 1,
            'weight' => 1, 'weight_unit' => 'kg', 'calories' => 100, 'expiry_date' => now()->addDays(7),
        ]);
        config(['services.openrouter.key' => null]);
        Http::fake();

        $response = $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill");

        $response->assertStatus(200);
        $response->assertJson(['fields' => []]);
        $this->assertNotNull($response->json('message'));
        $this->assertSame(5, $user->fresh()->ai_credits);
    }

    public function test_autofill_caches_an_ai_resolved_category_for_a_later_item_with_the_same_name(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'weight' => 1, 'weight_unit' => 'kg', 'calories' => 50,
                'shelf_life_days' => 5, 'nutrition_category' => 'other_extras',
            ])]]],
        ], 200)]);
        $first = Item::create(['section_id' => $section->id, 'name' => 'Zorbnik Flavor Cubes', 'icon' => 'placeholder', 'quantity' => 1]);

        $this->actingAs($user)->postJson("/api/items/{$first->id}/autofill")->assertStatus(200);
        $this->assertSame(4, $user->fresh()->ai_credits);

        // Same name, but this item only needs its food group - no AI key configured this
        // time, so a fresh AI call would fail outright were the cache not consulted first.
        config(['services.openrouter.key' => null]);
        $second = Item::create([
            'section_id' => $section->id, 'name' => 'Zorbnik Flavor Cubes', 'icon' => 'placeholder', 'quantity' => 1,
            'weight' => 1, 'weight_unit' => 'kg', 'calories' => 50, 'expiry_date' => now()->addDays(5),
        ]);

        $response = $this->actingAs($user)->postJson("/api/items/{$second->id}/autofill");

        $response->assertStatus(200);
        $response->assertJson(['fields' => ['nutrition_category' => 'other_extras']]);
        $this->assertSame(4, $user->fresh()->ai_credits);
    }
}
