<?php

namespace Tests\Feature;

use App\Jobs\SendPushNotification;
use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use App\Models\NotificationPref;
use App\Models\PushToken;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NotificationDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private function sharedFridge(User $owner, User ...$members): Fridge
    {
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        foreach ($members as $m) {
            $fridge->members()->attach($m->id, ['role' => 'member']);
        }

        return $fridge;
    }

    public function test_requesting_to_join_notifies_the_owner(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create(['username' => 'sam']);
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Kitchen']);

        $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests")->assertStatus(201);

        $this->assertDatabaseHas('notification_events', [
            'user_id' => $owner->id,
            'fridge_id' => $fridge->id,
            'kind' => 'joinRequest',
            'message' => '@sam asked to join Kitchen',
        ]);
    }

    public function test_an_invite_reaches_the_invitee_feed_before_they_are_a_member(): void
    {
        $owner = User::factory()->create(['username' => 'jordan']);
        $target = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Loft']);

        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/invites", ['userId' => $target->id])
            ->assertStatus(201);

        $event = $target->notificationPref; // touch nothing; just fetch feed
        $feed = $this->actingAs($target)->getJson('/api/notification-events')->assertOk()->json('data');

        $this->assertCount(1, $feed);
        $this->assertSame('invite', $feed[0]['kind']);
        $this->assertSame('@jordan invited you to join Loft', $feed[0]['message']);

        // ...and they can clear it even though they're not on the fridge.
        $this->actingAs($target)->patchJson("/api/notification-events/{$feed[0]['id']}", ['done' => true])
            ->assertOk();
    }

    public function test_approving_a_request_notifies_the_requester(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Kitchen']);
        $jr = FridgeJoinRequest::create([
            'fridge_id' => $fridge->id,
            'requester_id' => $requester->id,
            'status' => 'pending',
            'initiated_by' => 'requester',
        ]);

        $this->actingAs($owner)->postJson("/api/join-requests/{$jr->id}/approve")->assertNoContent();

        $this->assertDatabaseHas('notification_events', [
            'user_id' => $requester->id,
            'kind' => 'requestApproved',
        ]);
    }

    public function test_declining_a_request_notifies_the_requester(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Kitchen']);
        $jr = FridgeJoinRequest::create([
            'fridge_id' => $fridge->id,
            'requester_id' => $requester->id,
            'status' => 'pending',
            'initiated_by' => 'requester',
        ]);

        $this->actingAs($owner)->postJson("/api/join-requests/{$jr->id}/decline")->assertNoContent();

        $this->assertDatabaseHas('notification_events', [
            'user_id' => $requester->id,
            'kind' => 'requestDeclined',
        ]);
    }

    public function test_leaving_a_fridge_notifies_the_owner(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create(['username' => 'lee']);
        $fridge = $this->sharedFridge($owner, $member);

        $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/leave")->assertNoContent();

        $this->assertDatabaseHas('notification_events', [
            'user_id' => $owner->id,
            'kind' => 'memberLeft',
            'message' => '@lee left Shared',
        ]);
    }

    public function test_a_note_notifies_other_members_but_not_the_author(): void
    {
        $owner = User::factory()->create(['username' => 'ana']);
        $member = User::factory()->create();
        $fridge = $this->sharedFridge($owner, $member);

        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/notes", [
            'text' => 'buy milk',
            'color' => 'amber',
        ])->assertStatus(201);

        $this->assertDatabaseHas('notification_events', ['user_id' => $member->id, 'kind' => 'note']);
        $this->assertDatabaseMissing('notification_events', ['user_id' => $owner->id, 'kind' => 'note']);
    }

    public function test_social_pref_off_suppresses_the_event(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        NotificationPref::create(['user_id' => $owner->id, 'social' => false]);
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Kitchen']);

        $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests")->assertStatus(201);

        $this->assertDatabaseMissing('notification_events', ['user_id' => $owner->id, 'kind' => 'joinRequest']);
    }

    public function test_adding_an_item_to_a_shared_fridge_notifies_crew_who_opted_in(): void
    {
        $owner = User::factory()->create(['username' => 'kai']);
        $optedIn = User::factory()->create();
        $optedOut = User::factory()->create();
        NotificationPref::create(['user_id' => $optedIn->id, 'crew_actions_enabled' => true]);
        NotificationPref::create(['user_id' => $optedOut->id, 'crew_actions_enabled' => false]);
        $fridge = $this->sharedFridge($owner, $optedIn, $optedOut);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        $this->actingAs($owner)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Eggs',
            'icon' => 'egg',
        ])->assertStatus(201);

        $this->assertDatabaseHas('notification_events', ['user_id' => $optedIn->id, 'kind' => 'itemAdded']);
        $this->assertDatabaseMissing('notification_events', ['user_id' => $optedOut->id, 'kind' => 'itemAdded']);
        $this->assertDatabaseMissing('notification_events', ['user_id' => $owner->id, 'kind' => 'itemAdded']);
    }

    public function test_a_solo_fridge_never_fires_crew_item_events(): void
    {
        $owner = User::factory()->create();
        NotificationPref::create(['user_id' => $owner->id, 'crew_actions_enabled' => true]);
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Mine']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        $this->actingAs($owner)->postJson("/api/sections/{$section->id}/items", ['name' => 'Eggs', 'icon' => 'egg'])
            ->assertStatus(201);

        $this->assertDatabaseCount('notification_events', 0);
    }

    public function test_notification_dispatches_a_push_job(): void
    {
        Bus::fake([SendPushNotification::class]);

        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Kitchen']);

        $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests")->assertStatus(201);

        Bus::assertDispatched(SendPushNotification::class, fn ($job) => $job->userId === $owner->id);
    }

    public function test_register_and_unregister_a_push_token(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[abc]',
            'platform' => 'ios',
        ])->assertNoContent();
        $this->actingAs($user)->postJson('/api/push-tokens', ['token' => 'ExponentPushToken[abc]'])->assertNoContent();

        $this->assertDatabaseCount('push_tokens', 1);

        $this->actingAs($user)->deleteJson('/api/push-tokens', ['token' => 'ExponentPushToken[abc]'])->assertNoContent();
        $this->assertDatabaseCount('push_tokens', 0);
    }

    public function test_a_token_moves_to_the_latest_user(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        $this->actingAs($a)->postJson('/api/push-tokens', ['token' => 'ExponentPushToken[x]'])->assertNoContent();
        $this->actingAs($b)->postJson('/api/push-tokens', ['token' => 'ExponentPushToken[x]'])->assertNoContent();

        $this->assertDatabaseCount('push_tokens', 1);
        $this->assertDatabaseHas('push_tokens', ['token' => 'ExponentPushToken[x]', 'user_id' => $b->id]);
    }

    public function test_push_job_sends_to_expo_and_prunes_dead_tokens(): void
    {
        $user = User::factory()->create();
        PushToken::create(['user_id' => $user->id, 'token' => 'ExponentPushToken[live]']);
        PushToken::create(['user_id' => $user->id, 'token' => 'ExponentPushToken[dead]']);

        Http::fake([
            'exp.host/*' => Http::response(['data' => [
                ['status' => 'ok', 'id' => '1'],
                ['status' => 'error', 'message' => 'gone', 'details' => ['error' => 'DeviceNotRegistered']],
            ]]),
        ]);

        (new SendPushNotification($user->id, 'Title', 'Body', ['kind' => 'invite']))->handle();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'exp.host')
            && count($request->data()) === 2
            && $request->data()[0]['title'] === 'Title');

        $this->assertDatabaseMissing('push_tokens', ['token' => 'ExponentPushToken[dead]']);
        $this->assertDatabaseHas('push_tokens', ['token' => 'ExponentPushToken[live]']);
    }
}
