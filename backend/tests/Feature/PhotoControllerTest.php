<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PhotoControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_scan_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 2]); // PHOTO_SCAN costs 3
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ])->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_scan_succeeds_and_spends_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // forces the mock detection path

        $response = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['photo_scan_id', 'status', 'file_url', 'detected_items']);
        $this->assertSame(7, $user->fresh()->ai_credits);
    }

    public function test_detected_items_get_a_real_icon_key_guessed_from_the_parsed_name(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // forces the mock detection path

        $response = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);

        $response->assertStatus(200);
        $icons = collect($response->json('detected_items'))->pluck('icon');
        $this->assertTrue($icons->contains('milk'));
        $this->assertTrue($icons->contains('yogurt'));
        $this->assertTrue($icons->contains('cheese'));
        // Spinach is one of the 10 curated keys - proves the old bogus 'vegetable' key (not a
        // real pack entry at all) is gone.
        $this->assertTrue($icons->contains('spinach'));
        $this->assertFalse($icons->contains('vegetable'));
        $this->assertFalse($icons->contains(''));
    }

    public function test_the_scan_image_is_written_to_the_configured_private_media_disk(): void
    {
        Storage::fake('s3');
        config(['filesystems.private_media_disk' => 's3', 'services.openrouter.key' => null]);

        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        $section = $this->sectionFor($user);

        $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ])->assertStatus(200);

        $this->assertNotEmpty(Storage::disk('s3')->files('photos'));
    }

    public function test_detected_items_carry_a_normalized_bounding_box(): void
    {
        config(['services.openrouter.key' => 'test-key', 'services.openrouter.photo_scan_model' => 'google/gemini-2.5-flash']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                ['detected_name' => 'milk bottle', 'parsed_name' => 'Milk', 'confidence' => 0.9, 'box' => [100, 50, 600, 300]],
                ['detected_name' => 'eggs', 'parsed_name' => 'Eggs', 'confidence' => 0.8, 'box' => [0.1, 0.2, 0.3, 0.5]],
                ['detected_name' => 'jar', 'parsed_name' => 'Jam', 'confidence' => 0.4, 'box' => 'somewhere'],
                ['detected_name' => 'butter', 'parsed_name' => 'Butter', 'confidence' => 0.7],
            ])]]],
        ], 200)]);

        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);

        $items = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ])->assertStatus(200)->json('detected_items');

        $this->assertSame([100, 50, 600, 300], $items[0]['box']);
        $this->assertSame([100, 200, 300, 500], $items[1]['box']); // 0-1 fractions scaled up
        $this->assertNull($items[2]['box']);
        $this->assertNull($items[3]['box']);
        $this->assertSame(0.4, $items[2]['confidence']);

        Http::assertSent(fn ($request) => $request['model'] === 'google/gemini-2.5-flash');
    }

    public function test_mock_detection_includes_boxes_so_the_sweep_can_be_demoed_without_a_key(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        $items = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ])->assertStatus(200)->json('detected_items');

        foreach ($items as $item) {
            $this->assertCount(4, $item['box']);
        }
    }

    public function test_the_scan_returns_the_scene_and_a_storage_guess_per_item(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'scene' => 'pantry',
                'items' => [
                    ['parsed_name' => 'Rice', 'confidence' => 0.9, 'storage' => 'pantry'],
                    ['parsed_name' => 'Peas', 'confidence' => 0.8, 'storage' => 'basement'],
                ],
            ])]]],
        ], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);

        $res = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('pantry.jpg'),
        ])->assertStatus(200);

        $this->assertSame('pantry', $res->json('scene'));
        $this->assertSame('pantry', $res->json('detected_items.0.storage'));
        $this->assertNull($res->json('detected_items.1.storage')); // not one of fridge/freezer/pantry
    }

    public function test_an_unknown_scene_comes_back_as_null(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"scene": "garage", "items": []}']]],
        ], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);

        $res = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('x.jpg'),
        ])->assertStatus(200);

        $this->assertNull($res->json('scene'));
        $this->assertSame([], $res->json('detected_items'));
        $this->assertSame(7, $user->fresh()->ai_credits); // a successful empty scan is still charged
    }
}
