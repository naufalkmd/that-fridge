<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserGoalControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/user-goal')->assertStatus(401);
    }

    public function test_show_creates_a_reasonable_default_goal(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/user-goal');

        // firstOrCreate() creates the row on this first-ever access, and Laravel's implicit
        // resource response returns 201 for a freshly-created model rather than 200.
        $response->assertStatus(201);
        $response->assertJson([
            'data' => [
                'metricType' => 'waste_rate',
                'targetValue' => 20,
                'period' => 'weekly',
                'isActive' => true,
            ],
        ]);

        $this->assertDatabaseHas('user_goals', [
            'user_id' => $user->id,
            'metric_type' => 'waste_rate',
        ]);
    }

    public function test_update_can_change_metric_target_and_period(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-goal', [
            'metricType' => 'items_rescued',
            'targetValue' => 5,
            'period' => 'monthly',
        ]);

        $response->assertJson([
            'data' => [
                'metricType' => 'items_rescued',
                'targetValue' => 5,
                'period' => 'monthly',
            ],
        ]);

        $this->assertDatabaseHas('user_goals', [
            'user_id' => $user->id,
            'metric_type' => 'items_rescued',
            'target_value' => 5,
            'period' => 'monthly',
        ]);
    }

    public function test_update_can_deactivate_and_reactivate(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-goal', ['isActive' => false]);
        $response->assertJson(['data' => ['isActive' => false]]);

        $response = $this->actingAs($user)->patchJson('/api/user-goal', ['isActive' => true]);
        $response->assertJson(['data' => ['isActive' => true]]);
    }

    public function test_update_rejects_unsupported_metric_type(): void
    {
        $user = User::factory()->create();

        // money_saved isn't offered - there's no price data anywhere to compute it from.
        $response = $this->actingAs($user)->patchJson('/api/user-goal', ['metricType' => 'money_saved']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('metricType');
    }

    public function test_update_rejects_target_value_over_100_for_a_percentage_metric(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->patchJson('/api/user-goal', ['metricType' => 'waste_rate']);

        $response = $this->actingAs($user)->patchJson('/api/user-goal', ['targetValue' => 150]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('targetValue');
    }

    public function test_update_allows_target_value_over_100_for_items_rescued(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->patchJson('/api/user-goal', ['metricType' => 'items_rescued']);

        $response = $this->actingAs($user)->patchJson('/api/user-goal', ['targetValue' => 150]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['targetValue' => 150]]);
    }
}
