<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BarcodeControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_scan_requires_authentication(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);

        $response = $this->postJson("/api/sections/{$section->id}/items/barcode", ['barcode' => '123']);

        $response->assertStatus(401);
    }

    public function test_scan_rejects_a_section_owned_by_another_user(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $section = $this->sectionFor($owner);

        $response = $this->actingAs($intruder)->postJson("/api/sections/{$section->id}/items/barcode", [
            'barcode' => '123',
        ]);

        $response->assertStatus(403);
    }

    public function test_scan_returns_the_suggestion_with_an_ai_derived_location(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake([
            'world.openfoodfacts.org/*' => Http::response([
                'product' => [
                    'product_name' => 'Frozen Peas',
                    'categories' => 'en:Frozen vegetables',
                    'code' => '456',
                ],
            ], 200),
            'openrouter.ai/*' => Http::response([
                'choices' => [['message' => ['content' => '{"shelf_life_days": 180, "location": "freezer"}']]],
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items/barcode", [
            'barcode' => '456',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'suggestion' => [
                'name' => 'Frozen Peas',
                'location' => 'freezer',
                'default_shelf_life_days' => 180,
            ],
        ]);
    }

    public function test_scan_returns_404_for_an_unknown_barcode(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        Http::fake(['world.openfoodfacts.org/*' => Http::response([], 404)]);

        $response = $this->actingAs($user)->postJson("/api/sections/{$section->id}/items/barcode", [
            'barcode' => '000',
        ]);

        $response->assertStatus(404);
    }
}
