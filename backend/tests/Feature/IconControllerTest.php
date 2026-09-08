<?php

namespace Tests\Feature;

use App\Models\GeneratedIcon;
use App\Models\User;
use App\Services\FalClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class IconControllerTest extends TestCase
{
    use RefreshDatabase;

    /** No GeneratedIcon factory exists - plain inserts for the quota tests below. */
    private function seedGeneratedIcons(User $user, int $count, string $kind = 'icon', int $credits = 1): void
    {
        for ($i = 0; $i < $count; $i++) {
            GeneratedIcon::create([
                'user_id' => $user->id,
                'kind' => $kind,
                'credits' => $credits,
                'prompt' => "icon {$i}",
                'image_path' => "icons/fake-{$i}.png",
                'image_url' => "https://cdn.test/fake-{$i}.png",
            ]);
        }
    }

    /** Same fake pipeline as IconGenerationServiceTest, for tests that need generation to actually succeed. */
    private function fakeSuccessfulGeneration(): void
    {
        Storage::fake('public');

        $img = imagecreatetruecolor(64, 64);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 80, 40));
        ob_start();
        imagepng($img);
        $sourcePng = ob_get_clean();

        Http::fake(['cdn.test/*' => Http::response($sourcePng, 200, ['Content-Type' => 'image/png'])]);

        $this->mock(FalClient::class, function ($m) {
            $m->shouldReceive('generate')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/raw.png']);
            $m->shouldReceive('removeBackground')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/cutout.png']);
        });
    }

    public function test_icon_generation_is_rejected_after_the_free_weekly_limit_for_a_non_pro_user(): void
    {
        $user = User::factory()->create();
        $this->seedGeneratedIcons($user, 5);

        $response = $this->actingAs($user)->postJson('/api/icons/generate', ['prompt' => 'a ripe tomato']);

        $response->assertStatus(402);
        $this->assertDatabaseCount('generated_icons', 5); // the rejected request was never sent to fal.ai
    }

    public function test_icon_generation_is_unlimited_for_a_pro_user(): void
    {
        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        $this->seedGeneratedIcons($user, 5);
        $this->fakeSuccessfulGeneration();

        $response = $this->actingAs($user)->postJson('/api/icons/generate', ['prompt' => 'a ripe tomato']);

        $response->assertStatus(200);
    }

    public function test_icon_generation_quota_only_counts_this_weeks_icons(): void
    {
        $user = User::factory()->create();
        $this->seedGeneratedIcons($user, 5);
        GeneratedIcon::where('user_id', $user->id)->update(['created_at' => now()->subWeeks(2)]);
        $this->fakeSuccessfulGeneration();

        $response = $this->actingAs($user)->postJson('/api/icons/generate', ['prompt' => 'a ripe tomato']);

        $response->assertStatus(200);
    }

    public function test_icon_generation_succeeds_under_the_free_weekly_limit(): void
    {
        $user = User::factory()->create();
        $this->seedGeneratedIcons($user, 4);
        $this->fakeSuccessfulGeneration();

        $response = $this->actingAs($user)->postJson('/api/icons/generate', ['prompt' => 'a ripe tomato']);

        $response->assertStatus(200);
    }

    public function test_recipe_image_generation_draws_on_the_same_weekly_budget_as_icons(): void
    {
        $user = User::factory()->create();
        $this->seedGeneratedIcons($user, 5); // budget spent on item icons

        $response = $this->actingAs($user)->postJson('/api/icons/generate', [
            'prompt' => 'a bowl of ramen', 'kind' => 'recipe',
        ]);

        $response->assertStatus(402);
        $this->assertDatabaseCount('generated_icons', 5);
    }

    public function test_a_recipe_image_generation_is_stored_with_its_kind(): void
    {
        $user = User::factory()->create();
        $this->fakeSuccessfulGeneration();

        $response = $this->actingAs($user)->postJson('/api/icons/generate', [
            'prompt' => 'a bowl of ramen', 'kind' => 'recipe',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('generated_icons', [
            'user_id' => $user->id, 'kind' => 'recipe', 'credits' => 1, 'prompt' => 'a bowl of ramen',
        ]);
    }

    public function test_icon_generation_rejects_an_unknown_kind(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/icons/generate', ['prompt' => 'x', 'kind' => 'sticker'])
            ->assertStatus(422);
    }
}
