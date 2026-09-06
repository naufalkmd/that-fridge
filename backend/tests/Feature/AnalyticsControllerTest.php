<?php

namespace Tests\Feature;

use App\Models\AnalyticsEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_can_post_events_and_they_land_with_no_user_id(): void
    {
        $response = $this->postJson('/api/events', [
            'events' => [
                ['name' => 'welcome_started', 'anon_id' => 'a_abc', 'platform' => 'ios', 'app_version' => '1.2.1'],
                ['name' => 'welcome_step_viewed', 'anon_id' => 'a_abc', 'props' => ['step' => 2]],
            ],
        ]);

        $response->assertNoContent();
        $this->assertDatabaseCount('analytics_events', 2);
        $this->assertDatabaseHas('analytics_events', [
            'name' => 'welcome_started',
            'anon_id' => 'a_abc',
            'user_id' => null,
            'platform' => 'ios',
        ]);
    }

    public function test_events_from_a_signed_in_client_are_attributed_to_that_user(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/events', [
            'events' => [['name' => 'signup_completed', 'props' => ['from' => 'direct']]],
        ])->assertNoContent();

        $this->assertDatabaseHas('analytics_events', [
            'name' => 'signup_completed',
            'user_id' => $user->id,
        ]);
        $this->assertSame(['from' => 'direct'], AnalyticsEvent::first()->props);
    }

    public function test_it_rejects_a_batch_larger_than_the_cap(): void
    {
        $events = array_fill(0, 51, ['name' => 'noise']);

        $this->postJson('/api/events', ['events' => $events])
            ->assertStatus(422)
            ->assertJsonValidationErrors('events');
    }

    public function test_it_rejects_an_event_with_no_name(): void
    {
        $this->postJson('/api/events', ['events' => [['props' => ['x' => 1]]]])
            ->assertStatus(422);
    }

    public function test_oversized_props_are_dropped_not_rejected(): void
    {
        $huge = ['blob' => str_repeat('x', 5000)];

        $this->postJson('/api/events', [
            'events' => [['name' => 'big_event', 'props' => $huge]],
        ])->assertNoContent();

        $this->assertNull(AnalyticsEvent::where('name', 'big_event')->first()->props);
    }
}
