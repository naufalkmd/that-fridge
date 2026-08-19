<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FridgeMemberControllerTest extends TestCase
{
    use RefreshDatabase;

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
}
