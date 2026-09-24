<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
}
