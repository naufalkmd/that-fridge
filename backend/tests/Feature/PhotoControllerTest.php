<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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

    public function test_the_scan_image_is_written_to_the_configured_media_disk(): void
    {
        Storage::fake('s3');
        config(['filesystems.media_disk' => 's3', 'services.openrouter.key' => null]);

        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        $section = $this->sectionFor($user);

        $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ])->assertStatus(200);

        $this->assertNotEmpty(Storage::disk('s3')->files('photos'));
    }
}
