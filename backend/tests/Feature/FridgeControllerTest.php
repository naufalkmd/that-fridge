<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FridgeControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_only_lists_fridges_the_user_is_a_member_of(): void
    {
        $user = User::factory()->create();
        $stranger = User::factory()->create();

        $mine = Fridge::create(['user_id' => $user->id, 'name' => 'Mine']);
        Fridge::create(['user_id' => $stranger->id, 'name' => 'Not mine']);

        $response = $this->actingAs($user)->getJson('/api/fridges');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJson(['data' => [['id' => (string) $mine->id, 'name' => 'Mine']]]);
    }

    public function test_index_includes_a_fridge_the_user_joined_but_does_not_own(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->getJson('/api/fridges');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJson(['data' => [['id' => (string) $fridge->id, 'role' => 'member']]]);
    }

    public function test_store_makes_the_creator_an_owner_role_member(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/fridges', ['name' => 'New Fridge']);

        $response->assertStatus(200);
        $fridgeId = $response->json('data.id');
        $this->assertDatabaseHas('fridge_members', ['fridge_id' => $fridgeId, 'user_id' => $user->id, 'role' => 'owner']);
        $response->assertJson(['data' => ['role' => 'owner', 'member_count' => 1]]);
    }

    public function test_a_joined_non_owner_member_can_rename_and_restyle_the_fridge(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->patchJson("/api/fridges/{$fridge->id}", ['name' => 'Renamed by member']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('fridges', ['id' => $fridge->id, 'name' => 'Renamed by member']);
    }

    public function test_only_the_owner_can_delete_the_fridge(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $this->actingAs($member)->deleteJson("/api/fridges/{$fridge->id}")->assertStatus(403);
        $this->assertDatabaseHas('fridges', ['id' => $fridge->id]);

        $this->actingAs($owner)->deleteJson("/api/fridges/{$fridge->id}")->assertStatus(204);
        $this->assertDatabaseMissing('fridges', ['id' => $fridge->id]);
    }

    public function test_a_true_non_member_still_gets_403(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Private']);

        $this->actingAs($stranger)->getJson("/api/fridges/{$fridge->id}")->assertStatus(403);
        $this->actingAs($stranger)->patchJson("/api/fridges/{$fridge->id}", ['name' => 'Hijacked'])->assertStatus(403);
        $this->actingAs($stranger)->deleteJson("/api/fridges/{$fridge->id}")->assertStatus(403);
    }
}
