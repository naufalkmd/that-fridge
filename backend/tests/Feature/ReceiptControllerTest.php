<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ReceiptControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_scan_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 2]); // RECEIPT_SCAN costs 3
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        $this->actingAs($user)->post("/api/sections/{$section->id}/items/receipt/scan", [
            'image' => UploadedFile::fake()->image('receipt.jpg'),
        ])->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_scan_succeeds_and_spends_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // forces the mock detection path

        $response = $this->actingAs($user)->post("/api/sections/{$section->id}/items/receipt/scan", [
            'image' => UploadedFile::fake()->image('receipt.jpg'),
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['receipt_id', 'status', 'file_url', 'detected_items']);
        $this->assertSame(7, $user->fresh()->ai_credits);
    }
}
