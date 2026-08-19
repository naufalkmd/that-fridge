<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FridgeJoinRequestControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_request_to_join_a_fridge(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $response = $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests");

        $response->assertStatus(201);
        $response->assertJson(['data' => ['status' => 'pending', 'requesterId' => (string) $requester->id]]);
        $this->assertDatabaseHas('fridge_join_requests', ['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);
    }

    public function test_requesting_to_join_a_fridge_youre_already_a_member_of_is_a_validation_error(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/join-requests");

        $response->assertStatus(422);
    }

    public function test_re_requesting_after_a_decline_flips_the_existing_row_back_to_pending(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $existing = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'declined']);

        $response = $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests");

        $response->assertStatus(200);
        $this->assertDatabaseCount('fridge_join_requests', 1);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $existing->id, 'status' => 'pending']);
    }

    public function test_only_the_owner_can_list_pending_requests(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);
        FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);

        $this->actingAs($member)->getJson("/api/fridges/{$fridge->id}/join-requests")->assertStatus(403);

        $response = $this->actingAs($owner)->getJson("/api/fridges/{$fridge->id}/join-requests");
        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_only_the_owner_can_approve_or_decline(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);
        $joinRequest = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);

        $this->actingAs($member)->postJson("/api/join-requests/{$joinRequest->id}/approve")->assertStatus(403);
        $this->actingAs($member)->postJson("/api/join-requests/{$joinRequest->id}/decline")->assertStatus(403);
    }

    public function test_approving_a_request_attaches_the_requester_as_a_member(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $joinRequest = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);

        $response = $this->actingAs($owner)->postJson("/api/join-requests/{$joinRequest->id}/approve");

        $response->assertStatus(204);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $requester->id, 'role' => 'member']);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $joinRequest->id, 'status' => 'accepted']);
    }

    public function test_approving_an_already_approved_request_again_does_not_error(): void
    {
        // Simulates a double-click/two-tab race: the requester is already a member (as if a
        // first approve() call already went through) by the time a second approve() call for
        // the same request lands - it must stay idempotent, not 500 on the unique constraint.
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($requester->id, ['role' => 'member']);
        $joinRequest = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);

        $response = $this->actingAs($owner)->postJson("/api/join-requests/{$joinRequest->id}/approve");

        $response->assertStatus(204);
        // Owner's own row (auto-attached on fridge creation) + the requester's - no duplicate
        // requester row from re-attaching.
        $this->assertDatabaseCount('fridge_members', 2);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $joinRequest->id, 'status' => 'accepted']);
    }

    public function test_declining_a_request_does_not_create_a_membership(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $joinRequest = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending']);

        $response = $this->actingAs($owner)->postJson("/api/join-requests/{$joinRequest->id}/decline");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $requester->id]);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $joinRequest->id, 'status' => 'declined']);
    }

    public function test_an_owner_can_invite_a_user_directly(): void
    {
        $owner = User::factory()->create();
        $invitee = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $response = $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/invites", ['userId' => $invitee->id]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['status' => 'pending', 'requesterId' => (string) $invitee->id]]);
        $this->assertDatabaseHas('fridge_join_requests', ['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);
    }

    public function test_only_the_owner_can_send_an_invite(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $invitee = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/invites", ['userId' => $invitee->id])->assertStatus(403);
    }

    public function test_inviting_someone_already_a_member_is_a_validation_error(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/invites", ['userId' => $member->id])->assertStatus(422);
    }

    public function test_the_invited_user_can_accept_their_own_invite_but_the_owner_cannot(): void
    {
        $owner = User::factory()->create();
        $invitee = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $invite = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);

        $this->actingAs($owner)->postJson("/api/join-requests/{$invite->id}/approve")->assertStatus(403);

        $response = $this->actingAs($invitee)->postJson("/api/join-requests/{$invite->id}/approve");
        $response->assertStatus(204);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $invitee->id, 'role' => 'member']);
    }

    public function test_the_invited_user_can_decline_their_own_invite_but_a_stranger_cannot(): void
    {
        $owner = User::factory()->create();
        $invitee = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $invite = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);

        $this->actingAs($stranger)->postJson("/api/join-requests/{$invite->id}/decline")->assertStatus(403);

        $response = $this->actingAs($invitee)->postJson("/api/join-requests/{$invite->id}/decline");
        $response->assertStatus(204);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $invite->id, 'status' => 'declined']);
    }

    public function test_inviting_a_user_who_already_requested_to_join_approves_them_immediately(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $existing = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending', 'initiated_by' => 'requester']);

        $response = $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/invites", ['userId' => $requester->id]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $requester->id, 'role' => 'member']);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $existing->id, 'status' => 'accepted']);
        $this->assertDatabaseCount('fridge_join_requests', 1);
    }

    public function test_requesting_to_join_a_fridge_you_were_already_invited_to_accepts_the_invite_immediately(): void
    {
        $owner = User::factory()->create();
        $invitee = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $existing = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);

        $response = $this->actingAs($invitee)->postJson("/api/fridges/{$fridge->id}/join-requests");

        $response->assertStatus(200);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $invitee->id, 'role' => 'member']);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $existing->id, 'status' => 'accepted']);
        $this->assertDatabaseCount('fridge_join_requests', 1);
    }

    public function test_the_join_requests_list_excludes_owner_initiated_invites(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $invitee = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $requester->id, 'status' => 'pending', 'initiated_by' => 'requester']);
        FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);

        $response = $this->actingAs($owner)->getJson("/api/fridges/{$fridge->id}/join-requests");

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJson(['data' => [['requesterId' => (string) $requester->id]]]);
    }

    public function test_my_invites_lists_only_my_own_pending_invites_with_fridge_and_inviter_identity(): void
    {
        $owner = User::factory()->create(['username' => 'jordan']);
        $invitee = User::factory()->create();
        $someoneElse = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => "Jordan's Kitchen"]);
        FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'owner']);
        // Not mine - shouldn't appear.
        FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => $someoneElse->id, 'status' => 'pending', 'initiated_by' => 'owner']);
        // Mine, but I initiated it - shouldn't appear as an "invite."
        $otherFridge = Fridge::create(['user_id' => $someoneElse->id, 'name' => 'Other']);
        FridgeJoinRequest::create(['fridge_id' => $otherFridge->id, 'requester_id' => $invitee->id, 'status' => 'pending', 'initiated_by' => 'requester']);

        $response = $this->actingAs($invitee)->getJson('/api/invites');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJson(['data' => [['fridgeName' => "Jordan's Kitchen", 'inviterUsername' => 'jordan']]]);
    }

    public function test_a_newly_approved_member_can_actually_manage_items_in_the_shared_fridge(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $section = \App\Models\Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        $joinRequest = $this->actingAs($requester)->postJson("/api/fridges/{$fridge->id}/join-requests")->json('data');
        $this->actingAs($owner)->postJson("/api/join-requests/{$joinRequest['id']}/approve")->assertStatus(204);

        $createResponse = $this->actingAs($requester)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
        ]);
        $createResponse->assertStatus(201);
        $itemId = $createResponse->json('data.id');

        $this->actingAs($requester)->patchJson("/api/items/{$itemId}", ['name' => 'Oat Milk'])->assertStatus(200);
        $this->actingAs($requester)->deleteJson("/api/items/{$itemId}")->assertStatus(204);
    }
}
