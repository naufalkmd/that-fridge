<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BadgeControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_requires_authentication(): void
    {
        $this->getJson('/api/badges')->assertStatus(401);
    }

    public function test_index_returns_all_known_badges_at_zero_progress_for_a_new_user(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/badges');

        $response->assertStatus(200);
        $keys = collect($response->json('data'))->pluck('badgeKey')->sort()->values();
        $this->assertSame(['first_link_recipe', 'full_week_variety', 'rescued_10', 'zero_waste_week'], $keys->all());
        $response->assertJsonFragment(['badgeKey' => 'rescued_10', 'progress' => 0, 'target' => 10, 'earnedAt' => null]);
    }

    public function test_progress_accumulates_without_awarding_before_the_threshold(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/badges/rescued_10/progress', ['incrementBy' => 1]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['badgeKey' => 'rescued_10', 'progress' => 1, 'earnedAt' => null]]);
    }

    public function test_progress_awards_the_badge_once_the_threshold_is_reached(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 10; $i++) {
            $response = $this->actingAs($user)->postJson('/api/badges/rescued_10/progress', ['incrementBy' => 1]);
        }

        $response->assertJson(['data' => ['badgeKey' => 'rescued_10', 'progress' => 10]]);
        $this->assertNotNull($response->json('data.earnedAt'));
    }

    public function test_progress_does_not_regress_or_overshoot_once_earned(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($user)->postJson('/api/badges/rescued_10/progress', ['incrementBy' => 1]);
        }
        $badgesAfterEarning = collect($this->actingAs($user)->getJson('/api/badges')->json('data'));
        $earnedAt = $badgesAfterEarning->firstWhere('badgeKey', 'rescued_10')['earnedAt'];
        $this->assertNotNull($earnedAt);

        // Calling again after earning must not push progress past the target or move earnedAt.
        $response = $this->actingAs($user)->postJson('/api/badges/rescued_10/progress', ['incrementBy' => 1]);

        $response->assertJson(['data' => ['progress' => 10]]);
        $badgesAfterExtraCall = collect($this->actingAs($user)->getJson('/api/badges')->json('data'));
        $this->assertSame($earnedAt, $badgesAfterExtraCall->firstWhere('badgeKey', 'rescued_10')['earnedAt']);
    }

    public function test_progress_rejects_an_unknown_badge_key(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/badges/not-a-real-badge/progress', ['incrementBy' => 1]);

        $response->assertStatus(404);
    }
}
