<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ExpiryScanControllerTest extends TestCase
{
    use RefreshDatabase;

    private function sectionFor(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    private function scan(User $user, Section $section)
    {
        return $this->actingAs($user)->post("/api/sections/{$section->id}/items/expiry-scan", [
            'image' => UploadedFile::fake()->image('package.jpg'),
        ]);
    }

    public function test_scan_spends_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // no-key path, still a 200

        $this->scan($user, $section)->assertStatus(200);
        $this->assertSame(3, $user->fresh()->ai_credits); // EXPIRY_SCAN = 2
    }

    public function test_scan_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 1]); // EXPIRY_SCAN costs 2
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        $this->scan($user, $section)->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_scan_credits_are_scoped_per_user(): void
    {
        $broke = User::factory()->create(['ai_credits' => 0]);
        $other = User::factory()->create(['ai_credits' => 10]);
        config(['services.openrouter.key' => null]);

        $this->scan($broke, $this->sectionFor($broke))->assertStatus(402);
        $this->scan($other, $this->sectionFor($other))->assertStatus(200);
    }
}
