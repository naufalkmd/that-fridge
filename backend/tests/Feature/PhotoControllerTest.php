<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class PhotoControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_scan_is_rejected_for_a_non_pro_user(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        $response = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);

        $response->assertStatus(402);
    }

    public function test_scan_succeeds_for_a_pro_user(): void
    {
        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // forces the mock detection path

        $response = $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", [
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['photo_scan_id', 'status', 'file_url', 'detected_items']);
    }
}
