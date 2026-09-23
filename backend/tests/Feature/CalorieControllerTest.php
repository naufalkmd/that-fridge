<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CalorieControllerTest extends TestCase
{
    use RefreshDatabase;

    private function itemFor(User $user): Item
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        return $section->items()->create(['name' => 'Greek Yogurt', 'icon' => 'yogurt', 'weight' => 500, 'weight_unit' => 'g']);
    }

    private function estimate(User $user, Item $item)
    {
        return $this->actingAs($user)->postJson("/api/items/{$item->id}/estimate-calories");
    }

    private function scanLabel(User $user, Item $item)
    {
        return $this->actingAs($user)->post("/api/items/{$item->id}/scan-label", [
            'image' => UploadedFile::fake()->image('label.jpg'),
        ]);
    }

    // --- estimate ---------------------------------------------------------

    public function test_estimate_spends_credits_and_returns_a_fallback_number_without_a_key(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);
        Http::fake();

        $response = $this->estimate($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['mocked' => true]);
        $this->assertIsInt($response->json('calories'));
        $this->assertGreaterThan(0, $response->json('calories'));
        $this->assertSame(4, $user->fresh()->ai_credits); // CALORIE_ESTIMATE = 1
        Http::assertNothingSent();
    }

    public function test_estimate_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 0]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);

        $this->estimate($user, $item)->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_estimate_uses_the_live_model_when_a_key_is_configured(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"calories": 140, "basis": "per 500 g tub"}']]],
        ], 200)]);

        $response = $this->estimate($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['calories' => 140, 'basis' => 'per 500 g tub', 'mocked' => false]);
        $this->assertSame(4, $user->fresh()->ai_credits);
    }

    public function test_estimate_is_forbidden_for_another_users_item(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($owner);
        config(['services.openrouter.key' => null]);

        $this->estimate($stranger, $item)->assertStatus(403);
    }

    // --- scan-label ---------------------------------------------------------

    public function test_scan_label_spends_credits_and_is_not_refunded_without_a_key(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);
        Http::fake();

        $response = $this->scanLabel($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['found' => false]);
        $this->assertSame(3, $user->fresh()->ai_credits); // LABEL_SCAN = 2, no refund
        Http::assertNothingSent();
    }

    public function test_scan_label_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 1]); // LABEL_SCAN costs 2
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => null]);

        $this->scanLabel($user, $item)->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_scan_label_refunds_when_the_vision_call_fails(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], 500)]);

        $response = $this->scanLabel($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['found' => false]);
        $this->assertSame(5, $user->fresh()->ai_credits); // spent 2, refunded 2
    }

    public function test_scan_label_is_not_refunded_when_the_model_legitimately_finds_nothing(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"found": false}']]],
        ], 200)]);

        $response = $this->scanLabel($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['found' => false]);
        $this->assertSame(3, $user->fresh()->ai_credits); // spent 2, not refunded
    }

    public function test_scan_label_returns_the_extracted_calories_on_success(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"found": true, "calories": 180, "serving_size": "per serving (30g)", "confidence": "high"}']]],
        ], 200)]);

        $response = $this->scanLabel($user, $item);

        $response->assertStatus(200);
        $response->assertJson(['found' => true, 'calories' => 180, 'serving_size' => 'per serving (30g)', 'confidence' => 'high']);
        $this->assertSame(3, $user->fresh()->ai_credits);
    }

    public function test_scan_label_is_forbidden_for_another_users_item(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create(['ai_credits' => 5]);
        $item = $this->itemFor($owner);
        config(['services.openrouter.key' => null]);

        $this->scanLabel($stranger, $item)->assertStatus(403);
    }
}
