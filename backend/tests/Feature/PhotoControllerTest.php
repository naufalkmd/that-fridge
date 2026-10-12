<?php

namespace Tests\Feature;

use App\Models\ApiUsageLog;
use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
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
        $response->assertJsonStructure(['status', 'file_url', 'detected_items']);
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

    private function scan(User $user): TestResponse
    {
        return $this->actingAs($user)->post("/api/sections/{$this->sectionFor($user)->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);
    }

    public function test_a_reply_cut_off_at_the_token_limit_keeps_the_complete_items(): void
    {
        // A very full fridge: the model ran out of tokens part-way through the third item.
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [[
            'finish_reason' => 'length',
            'message' => ['content' => "```json\n".'{"scene":"fridge","items":[{"detected_name":"milk carton","parsed_name":"Milk","confidence":0.95,"condition":null,"box":[260,280,340,380],"storage":"fridge"},'
                .'{"detected_name":"jar, lid says }] \\"hot\\"","parsed_name":"Chilli Paste","confidence":0.8,"condition":null,"box":[10,20,300,400],"storage":"fridge"},'
                .'{"detected_name":"green bell pepper","parsed_name":"'],
        ]]], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $res = $this->scan($user)->assertStatus(200);

        $this->assertSame(['Milk', 'Chilli Paste'], array_column($res->json('detected_items'), 'parsed_name'));
        $this->assertSame('fridge', $res->json('scene'));
        $this->assertFalse($res->json('ai_failed'));
        $this->assertSame(7, $user->fresh()->ai_credits); // they got a result, so it is charged
    }

    public function test_an_unreadable_reply_is_refunded_and_flagged_as_a_failed_scan(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['finish_reason' => 'stop', 'message' => ['content' => 'I can see a fridge with some food in it.']]]], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $res = $this->scan($user)->assertStatus(200);

        $this->assertTrue($res->json('ai_failed'));
        $this->assertSame([], $res->json('detected_items'));
        $this->assertSame(10, $user->fresh()->ai_credits);
    }

    public function test_a_refused_ai_call_is_refunded_and_flagged_as_a_failed_scan(): void
    {
        // What the October 2026 outage looked like: the key had hit its spending limit.
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => ['message' => 'Key limit exceeded (total limit).', 'code' => 403]], 403)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $res = $this->scan($user)->assertStatus(200);

        $this->assertTrue($res->json('ai_failed'));
        $this->assertSame(10, $user->fresh()->ai_credits);
        $this->assertSame('forbidden', ApiUsageLog::sole()->reason);
    }

    public function test_a_successful_scan_is_not_flagged_as_failed_and_fills_the_constant_fields_itself(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['finish_reason' => 'stop', 'message' => [
            'content' => '{"scene":"fridge","items":[{"detected_name":"milk carton","parsed_name":"Milk","confidence":0.9,"condition":null,"box":[1,2,300,400],"storage":"fridge"}]}',
        ]]]], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $res = $this->scan($user)->assertStatus(200);

        $this->assertFalse($res->json('ai_failed'));
        // The model is no longer asked to write these two out for every item.
        $this->assertNull($res->json('detected_items.0.matched_product_id'));
        $this->assertFalse($res->json('detected_items.0.confirmed'));
        Http::assertSent(fn ($request) => $request['max_tokens'] === 3500
            && ! str_contains($request['messages'][0]['content'][0]['text'], 'matched_product_id'));
    }
}
