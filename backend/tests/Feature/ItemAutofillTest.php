<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ItemController::autofill - the item detail page's "Autofill" button. Covers the
 * missing-fields-only contract (never proposes a field the item already has), the
 * skip-the-credit-charge no-op when nothing's missing, and the refund-when-nothing-came-back
 * path, mirroring CalorieControllerTest's shape for the same class of credit-metered AI call.
 */
class ItemAutofillTest extends TestCase
{
    use RefreshDatabase;

    private function itemFor(User $user, array $attrs = []): Item
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        return $section->items()->create(array_merge(['name' => 'Greek Yogurt', 'icon' => 'yogurt'], $attrs));
    }

    private function autofill(User $user, Item $item)
    {
        return $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill");
    }

    public function test_spends_a_credit_and_returns_a_fallback_estimate_without_an_api_key(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);
        Http::fake();

        $response = $this->autofill($user, $item);

        $response->assertStatus(200);
        $fields = $response->json('fields');
        $this->assertArrayHasKey('weight', $fields);
        $this->assertArrayHasKey('weight_unit', $fields);
        $this->assertArrayHasKey('calories', $fields);
        $this->assertArrayHasKey('shelf_life_days', $fields);
        $this->assertArrayHasKey('expiry_date', $fields);
        $this->assertArrayHasKey('nutrition_category', $fields);
        $this->assertSame(4, $user->fresh()->ai_credits); // AUTOFILL = 1
        Http::assertNothingSent();
    }

    public function test_uses_the_live_model_when_a_key_is_configured(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"weight": 500, "weight_unit": "g", "calories": 300, "shelf_life_days": 10, "nutrition_category": "dairy"}']]],
        ], 200)]);

        $response = $this->autofill($user, $item);

        $response->assertStatus(200);
        $response->assertJsonPath('fields.weight', 500);
        $response->assertJsonPath('fields.weight_unit', 'g');
        $response->assertJsonPath('fields.calories', 300);
        $response->assertJsonPath('fields.shelf_life_days', 10);
        $response->assertJsonPath('fields.nutrition_category', 'dairy');
        $this->assertSame(4, $user->fresh()->ai_credits);
    }

    public function test_never_proposes_a_field_the_item_already_has(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user, [
            'weight' => 500, 'weight_unit' => 'g', 'calories' => 250,
            'expiry_date' => now()->addDays(5), 'shelf_life_days' => 5,
            'nutrition_category' => 'dairy',
        ]);
        config(['services.openrouter.key' => null]);

        $response = $this->autofill($user, $item);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('fields'));
        $this->assertSame(5, $user->fresh()->ai_credits); // nothing missing, no credit spent
    }

    public function test_only_proposes_the_one_field_the_item_is_missing(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user, [
            'weight' => 500, 'weight_unit' => 'g',
            'expiry_date' => now()->addDays(5), 'shelf_life_days' => 5,
            'nutrition_category' => 'dairy',
        ]);
        config(['services.openrouter.key' => null]);

        $response = $this->autofill($user, $item);

        $response->assertStatus(200);
        $this->assertSame(['calories'], array_keys($response->json('fields')));
        $this->assertSame(4, $user->fresh()->ai_credits);
    }

    public function test_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 0]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);

        $this->autofill($user, $item)->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_is_forbidden_for_another_users_item(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($owner);
        config(['services.openrouter.key' => null]);

        $this->autofill($stranger, $item)->assertStatus(403);
    }

    public function test_refunds_when_the_only_missing_field_is_weight_and_the_model_has_none(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user, [
            'calories' => 250, 'expiry_date' => now()->addDays(5), 'shelf_life_days' => 5,
            'nutrition_category' => 'dairy',
        ]);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"weight": null, "weight_unit": null, "calories": 300, "shelf_life_days": 10, "nutrition_category": "dairy"}']]],
        ], 200)]);

        $response = $this->autofill($user, $item);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('fields'));
        $this->assertSame(5, $user->fresh()->ai_credits); // spent 1, refunded 1
    }

    // ---- custom fields -------------------------------------------------------------------------

    private function withFields(Item $item, array $fields): Item
    {
        $item->forceFill(['custom_fields' => array_map(fn ($f) => ['id' => (string) Str::uuid()] + $f, $fields)])->save();

        return $item->fresh();
    }

    private function modelSays(array $json): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => json_encode($json)]]]], 200)]);
    }

    /** A complete item so only the custom field is missing. */
    private function complete(User $user, array $over = []): Item
    {
        return $this->itemFor($user, $over + [
            'name' => 'Chicken breast', 'icon' => 'meat', 'weight' => 500, 'weight_unit' => 'g', 'calories' => 825,
            'expiry_date' => now()->addDays(3)->toDateString(), 'nutrition_category' => 'protein',
        ]);
    }

    public function test_an_empty_protein_field_is_worked_out_from_the_food_and_its_weight_for_free(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete($user), [['label' => 'Protein', 'value' => '']]);
        Http::fake();

        $res = $this->autofill($user, $item)->assertOk();

        $this->assertSame('155 g', $res->json('fields.custom_fields.0.value')); // 31 g per 100 g x 500 g
        $this->assertSame('Protein', $res->json('fields.custom_fields.0.label'));
        $this->assertSame($item->custom_fields[0]['id'], $res->json('fields.custom_fields.0.id')); // the row keeps its id
        $this->assertSame(['Protein' => 'table'], $res->json('custom_sources'));
        $this->assertSame(5, $user->fresh()->ai_credits); // no AI, no credit
        Http::assertNothingSent();
        $this->assertSame('', $item->fresh()->custom_fields[0]['value']); // a proposal only: nothing written
    }

    public function test_the_unit_follows_the_label_or_the_users_own_style(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $withUnitInLabel = $this->withFields($this->complete($user), [['label' => 'Protein (g)', 'value' => '']]);
        Http::fake();

        $this->assertSame('155', $this->autofill($user, $withUnitInLabel)->json('fields.custom_fields.0.value'));

        // The owner writes "9 g" (with a unit) for Fat on another item, so a new Fat value follows that style.
        $salmon = $withUnitInLabel->section->items()->create(['name' => 'Salmon', 'icon' => 'fish']);
        $this->withFields($salmon, [['label' => 'Fat', 'value' => '9 g']]);
        $chicken = $withUnitInLabel->section->items()->create([
            'name' => 'Chicken breast', 'icon' => 'meat', 'weight' => 500, 'weight_unit' => 'g', 'calories' => 825,
            'expiry_date' => now()->addDays(3)->toDateString(), 'nutrition_category' => 'protein',
        ]);
        $chicken = $this->withFields($chicken, [['label' => 'Fat', 'value' => '']]);

        $this->assertSame('18 g', $this->autofill($user, $chicken)->json('fields.custom_fields.0.value')); // 3.6 g per 100 g x 500 g
    }

    public function test_a_value_the_user_already_gave_the_same_item_is_reused(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $first = $this->withFields($this->complete($user, ['name' => 'Greek Yogurt', 'weight' => 500]), [['label' => 'Protein', 'value' => '45 g']]);
        $again = $first->section->items()->create(['name' => 'greek yogurt', 'icon' => 'yogurt', 'weight' => 500, 'weight_unit' => 'g', 'calories' => 300, 'expiry_date' => now()->addDays(5)->toDateString(), 'nutrition_category' => 'dairy']);
        $again = $this->withFields($again, [['label' => 'protein', 'value' => '']]);
        Http::fake();

        $res = $this->autofill($user, $again)->assertOk();

        $this->assertSame('45 g', $res->json('fields.custom_fields.0.value'));
        $this->assertSame(['protein' => 'history'], $res->json('custom_sources'));
        $this->assertSame(5, $user->fresh()->ai_credits);
    }

    public function test_a_different_weight_does_not_reuse_history(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $first = $this->withFields($this->complete($user, ['name' => 'Greek Yogurt', 'weight' => 500]), [['label' => 'Protein', 'value' => '45 g']]);
        $other = $first->section->items()->create(['name' => 'Greek Yogurt', 'icon' => 'yogurt', 'weight' => 150, 'weight_unit' => 'g', 'calories' => 90, 'expiry_date' => now()->addDays(5)->toDateString(), 'nutrition_category' => 'dairy']);
        $other = $this->withFields($other, [['label' => 'Protein', 'value' => '']]);
        $this->modelSays(['weight' => 150, 'weight_unit' => 'g', 'calories' => 90, 'shelf_life_days' => 10, 'nutrition_category' => 'dairy', 'custom_fields' => ['Protein' => '13 g']]);

        $res = $this->autofill($user, $other)->assertOk();

        $this->assertSame('13 g', $res->json('fields.custom_fields.0.value'));
        $this->assertSame(['Protein' => 'ai'], $res->json('custom_sources'));
        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'], 'Greek Yogurt (qty') && str_contains($r['messages'][0]['content'], 'Protein: 45 g')); // their earlier entry is shown as an example
    }

    public function test_what_the_table_cannot_settle_goes_to_the_one_ai_call_with_the_item_context(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete($user, ['name' => 'Chicken rice', 'weight' => 400]), [['label' => 'Protein', 'value' => ''], ['label' => 'Origin', 'value' => '']]);
        $this->modelSays(['weight' => 400, 'weight_unit' => 'g', 'calories' => 600, 'shelf_life_days' => 2, 'nutrition_category' => 'other_extras', 'custom_fields' => ['Protein' => '28 g', 'Origin' => 'Malaysia']]);

        $res = $this->autofill($user, $item)->assertOk();

        $this->assertSame(['28 g', 'Malaysia'], array_column($res->json('fields.custom_fields'), 'value'));
        $this->assertSame(4, $user->fresh()->ai_credits); // exactly one credit, one call
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'], '"Protein", "Origin"') && str_contains($r['messages'][0]['content'], 'calories 825 kcal'));
    }

    public function test_it_never_guesses_a_price_or_a_brand_and_charges_nothing_when_that_is_all_there_is(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete($user), [['label' => 'Price', 'value' => ''], ['label' => 'Brand', 'value' => '']]);
        Http::fake();

        $res = $this->autofill($user, $item)->assertOk();

        $this->assertEmpty((array) $res->json('fields'));
        $this->assertSame(5, $user->fresh()->ai_credits);
        Http::assertNothingSent();
    }

    public function test_bad_model_answers_are_dropped_and_a_useless_call_is_refunded(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete($user, ['name' => 'Chicken rice', 'weight' => 400]), [['label' => 'Protein', 'value' => ''], ['label' => 'Fat', 'value' => ''], ['label' => 'Origin', 'value' => '']]);
        $this->modelSays(['weight' => 400, 'weight_unit' => 'g', 'calories' => 600, 'shelf_life_days' => 2, 'nutrition_category' => 'other_extras',
            'custom_fields' => ['Protein' => 'lots', 'Fat' => '900 g', 'Origin' => 'unknown']]); // text, more than the whole item, and "unknown"

        $res = $this->autofill($user, $item)->assertOk();

        $this->assertEmpty((array) $res->json('fields'));
        $this->assertSame(5, $user->fresh()->ai_credits); // refunded
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'reason' => 'item_autofill_refund']);
    }

    public function test_values_already_there_are_never_overwritten_and_other_rows_come_back_unchanged(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete($user), [['label' => 'Supplier', 'value' => 'Tesco'], ['label' => 'Protein', 'value' => '']]);
        Http::fake();

        $rows = $this->autofill($user, $item)->assertOk()->json('fields.custom_fields');

        $this->assertSame('Tesco', $rows[0]['value']);
        $this->assertSame('155 g', $rows[1]['value']);
        $this->assertCount(2, $rows);
    }

    public function test_nothing_is_proposed_for_someone_elses_item(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->withFields($this->complete(User::factory()->create()), [['label' => 'Protein', 'value' => '']]);

        $this->autofill($user, $item)->assertStatus(403);
    }
}
