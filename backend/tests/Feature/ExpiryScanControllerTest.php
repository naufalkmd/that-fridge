<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
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

    public function test_scan_succeeds_under_the_free_weekly_limit(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]); // forces the no-key path, still a 200

        $response = $this->scan($user, $section);

        $response->assertStatus(200);
    }

    public function test_scan_is_rejected_after_the_free_weekly_limit_for_a_non_pro_user(): void
    {
        $user = User::factory()->create();
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        for ($i = 0; $i < 10; $i++) {
            $this->scan($user, $section)->assertStatus(200);
        }

        $this->scan($user, $section)->assertStatus(402);
    }

    public function test_scan_is_unlimited_for_a_pro_user(): void
    {
        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        $section = $this->sectionFor($user);
        config(['services.openrouter.key' => null]);

        for ($i = 0; $i < 12; $i++) {
            $this->scan($user, $section)->assertStatus(200);
        }
    }

    public function test_scan_quota_is_scoped_per_user(): void
    {
        $capped = User::factory()->create();
        $other = User::factory()->create();
        $section = $this->sectionFor($capped);
        $otherSection = $this->sectionFor($other);
        config(['services.openrouter.key' => null]);
        Cache::put('expiry_scan_quota:'.$capped->id.':'.now()->format('oW'), 10, now()->addWeek());

        $this->scan($capped, $section)->assertStatus(402);
        $this->scan($other, $otherSection)->assertStatus(200);
    }
}
