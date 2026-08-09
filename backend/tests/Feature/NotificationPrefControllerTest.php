<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPrefControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/notification-prefs')->assertStatus(401);
    }

    public function test_show_creates_defaults_with_crew_actions_disabled(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/notification-prefs');

        // firstOrCreate() creates the row on this first-ever access, and Laravel's implicit
        // resource response returns 201 for a freshly-created model rather than 200.
        $response->assertStatus(201);
        $response->assertJson([
            'data' => [
                'expiryAlerts' => true,
                'lowStock' => true,
                'recipeTips' => true,
                'weeklyDigest' => true,
                // Crew acting on the user's behalf (moving items, adding to the shopping
                // list) is opt-in, unlike the other notification-style prefs.
                'crewActionsEnabled' => false,
            ],
        ]);

        $this->assertDatabaseHas('notification_prefs', [
            'user_id' => $user->id,
            'crew_actions_enabled' => false,
        ]);
    }

    public function test_update_can_enable_crew_actions(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/notification-prefs', [
            'crewActionsEnabled' => true,
        ]);

        $response->assertJson(['data' => ['crewActionsEnabled' => true]]);

        $this->assertDatabaseHas('notification_prefs', [
            'user_id' => $user->id,
            'crew_actions_enabled' => true,
        ]);
    }

    public function test_update_leaves_crew_actions_untouched_when_omitted(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->patchJson('/api/notification-prefs', ['crewActionsEnabled' => true]);

        $response = $this->actingAs($user)->patchJson('/api/notification-prefs', ['lowStock' => false]);

        $response->assertStatus(200); // the row already exists by now, so this is a normal update
        $response->assertJson(['data' => ['crewActionsEnabled' => true, 'lowStock' => false]]);
    }
}
