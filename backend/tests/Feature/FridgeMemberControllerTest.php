<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FridgeMemberControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_join_by_a_valid_code_adds_the_user_as_a_member(): void
    {
        $owner = User::factory()->create();
        $joiner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared', 'invite_code' => 'ABCD1234']);

        $response = $this->actingAs($joiner)->postJson('/api/fridges/join', ['code' => 'abcd1234']);

        $response->assertStatus(200);
        $response->assertJson(['data' => ['id' => (string) $fridge->id, 'role' => 'member']]);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $joiner->id, 'role' => 'member']);
    }

    public function test_join_with_an_unknown_code_is_a_validation_error(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/fridges/join', ['code' => 'NOTREAL1']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('code');
    }

    public function test_joining_a_fridge_youre_already_in_is_a_validation_error(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared', 'invite_code' => 'CODE0001']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->postJson('/api/fridges/join', ['code' => 'CODE0001']);

        $response->assertStatus(422);
    }

    public function test_only_the_owner_can_regenerate_the_invite_code(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared', 'invite_code' => 'OLDCODE1']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/invite-code/regenerate")->assertStatus(403);

        $response = $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/invite-code/regenerate");
        $response->assertStatus(200);
        $newCode = $response->json('invite_code');
        $this->assertNotNull($newCode);
        $this->assertNotEquals('OLDCODE1', $newCode);
    }

    public function test_any_member_can_list_members_but_only_the_owner_can_remove_one(): void
    {
        $owner = User::factory()->create();
        $memberA = User::factory()->create();
        $memberB = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($memberA->id, ['role' => 'member']);
        $fridge->members()->attach($memberB->id, ['role' => 'member']);

        $listResponse = $this->actingAs($memberA)->getJson("/api/fridges/{$fridge->id}/members");
        $listResponse->assertStatus(200);
        $listResponse->assertJsonCount(3, 'data');

        $this->actingAs($memberA)->deleteJson("/api/fridges/{$fridge->id}/members/{$memberB->id}")->assertStatus(403);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $memberB->id]);

        $this->actingAs($owner)->deleteJson("/api/fridges/{$fridge->id}/members/{$memberB->id}")->assertStatus(204);
        $this->assertDatabaseMissing('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $memberB->id]);
    }

    public function test_the_owner_cannot_be_removed_as_a_member(): void
    {
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Solo']);

        $response = $this->actingAs($owner)->deleteJson("/api/fridges/{$fridge->id}/members/{$owner->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $owner->id]);
    }

    public function test_a_member_can_leave_but_the_owner_cannot(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/leave")->assertStatus(422);

        $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/leave")->assertStatus(204);
        $this->assertDatabaseMissing('fridge_members', ['fridge_id' => $fridge->id, 'user_id' => $member->id]);
    }

    public function test_a_newly_joined_member_can_actually_manage_items_in_the_shared_fridge(): void
    {
        $owner = User::factory()->create();
        $joiner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared', 'invite_code' => 'JOINME01']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);

        $this->actingAs($joiner)->postJson('/api/fridges/join', ['code' => 'JOINME01'])->assertStatus(200);

        $createResponse = $this->actingAs($joiner)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk',
            'icon' => 'milk',
        ]);
        $createResponse->assertStatus(201);
        $itemId = $createResponse->json('data.id');

        $this->actingAs($joiner)->patchJson("/api/items/{$itemId}", ['name' => 'Oat Milk'])->assertStatus(200);
        $this->actingAs($joiner)->deleteJson("/api/items/{$itemId}")->assertStatus(204);
    }
}
