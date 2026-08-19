<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrganizerTallyControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/organizer-tally')->assertStatus(401);
    }

    public function test_show_creates_a_zeroed_tally(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/organizer-tally');

        // firstOrCreate() creates the row on this first-ever access, and Laravel's implicit
        // resource response returns 201 for a freshly-created model rather than 200.
        $response->assertStatus(201);
        $response->assertJson([
            'data' => [
                'itemsCheckedTotal' => 0,
                'itemsCorrectTotal' => 0,
                'lastCheckedAt' => null,
            ],
        ]);

        $this->assertDatabaseHas('organizer_tallies', [
            'user_id' => $user->id,
            'items_checked_total' => 0,
        ]);
    }

    public function test_increment_accumulates_across_multiple_sweeps(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/organizer-tally/increment', ['checked' => 6, 'correct' => 5])
            ->assertStatus(200)
            ->assertJson(['data' => ['itemsCheckedTotal' => 6, 'itemsCorrectTotal' => 5]]);

        $response = $this->actingAs($user)->postJson('/api/organizer-tally/increment', ['checked' => 4, 'correct' => 4]);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['itemsCheckedTotal' => 10, 'itemsCorrectTotal' => 9]]);
        $response->assertJsonPath('data.lastCheckedAt', fn ($value) => $value !== null);

        $this->assertDatabaseHas('organizer_tallies', [
            'user_id' => $user->id,
            'items_checked_total' => 10,
            'items_correct_total' => 9,
        ]);
    }

    public function test_increment_rejects_correct_greater_than_checked(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/organizer-tally/increment', ['checked' => 2, 'correct' => 5]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('correct');
    }

    public function test_increment_rejects_checked_below_one(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/organizer-tally/increment', ['checked' => 0, 'correct' => 0]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('checked');
    }
}
