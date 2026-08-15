<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UsageHistoryControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_without_days_remaining_or_freshness_leaves_the_new_columns_at_zero(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas',
            'icon' => 'banana',
        ]);

        $response->assertJson([
            'data' => [
                'count' => 1,
                'freshUseCount' => 0,
                'freshnessSum' => 0,
                'freshnessSampleCount' => 0,
            ],
        ]);
    }

    public function test_store_with_a_non_negative_days_remaining_increments_fresh_use_count(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas',
            'icon' => 'banana',
            'daysRemaining' => 2,
            'freshness' => 80,
        ]);

        $response->assertJson([
            'data' => [
                'freshUseCount' => 1,
                'freshnessSum' => 80,
                'freshnessSampleCount' => 1,
            ],
        ]);
    }

    public function test_store_with_a_negative_days_remaining_does_not_count_as_rescued(): void
    {
        $user = User::factory()->create();

        // Already past its date when removed - still records a freshness sample (freshness is
        // independent of the rescued flag), but shouldn't count as a rescue.
        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas',
            'icon' => 'banana',
            'daysRemaining' => -1,
            'freshness' => 5,
        ]);

        $response->assertJson([
            'data' => [
                'freshUseCount' => 0,
                'freshnessSum' => 5,
                'freshnessSampleCount' => 1,
            ],
        ]);
    }

    public function test_store_upserts_and_accumulates_across_repeated_calls(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas', 'icon' => 'banana', 'daysRemaining' => 2, 'freshness' => 80,
        ]);
        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas', 'icon' => 'banana', 'daysRemaining' => -1, 'freshness' => 20,
        ]);

        $response->assertJson([
            'data' => [
                'count' => 2,
                'freshUseCount' => 1,
                'freshnessSum' => 100,
                'freshnessSampleCount' => 2,
            ],
        ]);
    }

    public function test_store_records_the_nutrition_category(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas',
            'icon' => 'banana',
            'category' => 'fruit',
        ]);

        $response->assertJson(['data' => ['category' => 'fruit']]);
    }

    public function test_store_rejects_an_invalid_category(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas',
            'icon' => 'banana',
            'category' => 'carbs',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('category');
    }

    public function test_store_overwrites_the_category_on_a_later_call_and_keeps_it_when_omitted(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas', 'icon' => 'banana', 'category' => 'fruit',
        ]);
        $overwritten = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas', 'icon' => 'banana', 'category' => 'other_extras',
        ]);
        $overwritten->assertJson(['data' => ['category' => 'other_extras']]);

        $omitted = $this->actingAs($user)->postJson('/api/usage-history', [
            'name' => 'Bananas', 'icon' => 'banana',
        ]);
        $omitted->assertJson(['data' => ['category' => 'other_extras']]);
    }
}
