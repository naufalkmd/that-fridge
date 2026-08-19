<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FridgeNoteControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_can_post_a_note(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/notes", [
            'text' => "Don't eat the cake, it's for Tuesday",
            'color' => 'amber',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['text' => "Don't eat the cake, it's for Tuesday", 'color' => 'amber', 'authorUsername' => $member->username]]);
        $this->assertDatabaseHas('fridge_notes', ['fridge_id' => $fridge->id, 'user_id' => $member->id]);
    }

    public function test_a_non_member_cannot_post_a_note(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $this->actingAs($stranger)->postJson("/api/fridges/{$fridge->id}/notes", ['text' => 'Hi', 'color' => 'amber'])->assertStatus(403);
    }

    public function test_store_rejects_empty_text_and_an_invalid_color(): void
    {
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/notes", ['text' => '', 'color' => 'amber'])
            ->assertStatus(422)->assertJsonValidationErrors('text');
        $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/notes", ['text' => 'Hi', 'color' => 'purple'])
            ->assertStatus(422)->assertJsonValidationErrors('color');
    }

    public function test_a_member_who_is_not_the_author_can_edit_and_delete_another_members_note(): void
    {
        // The crux of this feature: unlike shopping items/items/every other resource in this
        // app, a fridge note is communal - any member can act on any note, not just its author.
        $owner = User::factory()->create();
        $author = User::factory()->create();
        $otherMember = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach([$author->id => ['role' => 'member'], $otherMember->id => ['role' => 'member']]);
        $note = $fridge->notes()->create(['user_id' => $author->id, 'text' => 'Original', 'color' => 'amber']);

        $editResponse = $this->actingAs($otherMember)->patchJson("/api/notes/{$note->id}", ['text' => 'Edited by someone else']);
        $editResponse->assertStatus(200);
        $editResponse->assertJson(['data' => ['text' => 'Edited by someone else']]);

        $deleteResponse = $this->actingAs($otherMember)->deleteJson("/api/notes/{$note->id}");
        $deleteResponse->assertStatus(204);
        $this->assertDatabaseMissing('fridge_notes', ['id' => $note->id]);
    }

    public function test_a_non_member_cannot_edit_or_delete_a_note(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $note = $fridge->notes()->create(['user_id' => $owner->id, 'text' => 'Original', 'color' => 'amber']);

        $this->actingAs($stranger)->patchJson("/api/notes/{$note->id}", ['text' => 'Hijacked'])->assertStatus(403);
        $this->actingAs($stranger)->deleteJson("/api/notes/{$note->id}")->assertStatus(403);
    }

    public function test_index_aggregates_notes_across_every_fridge_i_belong_to_and_excludes_others(): void
    {
        $owner = User::factory()->create();
        $joinedFridgeOwner = User::factory()->create();
        $strangerFridgeOwner = User::factory()->create();
        $ownedFridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Mine']);
        $joinedFridge = Fridge::create(['user_id' => $joinedFridgeOwner->id, 'name' => 'Joined']);
        $strangerFridge = Fridge::create(['user_id' => $strangerFridgeOwner->id, 'name' => 'Not Mine']);
        $joinedFridge->members()->attach($owner->id, ['role' => 'member']);

        $ownedFridge->notes()->create(['user_id' => $owner->id, 'text' => 'Note on mine', 'color' => 'amber']);
        $joinedFridge->notes()->create(['user_id' => $joinedFridgeOwner->id, 'text' => 'Note on joined', 'color' => 'blue']);
        $strangerFridge->notes()->create(['user_id' => $strangerFridgeOwner->id, 'text' => 'Should not appear', 'color' => 'bad']);

        $response = $this->actingAs($owner)->getJson('/api/notes');

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data');
        $texts = collect($response->json('data'))->pluck('text');
        $this->assertTrue($texts->contains('Note on mine'));
        $this->assertTrue($texts->contains('Note on joined'));
        $this->assertFalse($texts->contains('Should not appear'));
    }
}
