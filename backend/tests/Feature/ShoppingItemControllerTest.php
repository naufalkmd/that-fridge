<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\ShoppingItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShoppingItemControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_aggregates_items_across_every_fridge_i_belong_to_and_excludes_others(): void
    {
        $owner = User::factory()->create();
        $joinedFridgeOwner = User::factory()->create();
        $strangerFridgeOwner = User::factory()->create();
        $ownedFridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Mine']);
        $joinedFridge = Fridge::create(['user_id' => $joinedFridgeOwner->id, 'name' => 'Joined']);
        $strangerFridge = Fridge::create(['user_id' => $strangerFridgeOwner->id, 'name' => 'Not Mine']);
        $joinedFridge->members()->attach($owner->id, ['role' => 'member']);

        $ownedFridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => false]);
        $joinedFridge->shoppingItems()->create(['name' => 'Bread', 'section' => 'bakery', 'checked' => false]);
        $strangerFridge->shoppingItems()->create(['name' => 'Should not appear', 'section' => 'other', 'checked' => false]);

        $response = $this->actingAs($owner)->getJson('/api/shopping-items');

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data');
        $names = collect($response->json('data'))->pluck('name');
        $this->assertTrue($names->contains('Milk'));
        $this->assertTrue($names->contains('Bread'));
        $this->assertFalse($names->contains('Should not appear'));
    }

    public function test_a_member_can_add_an_item_to_the_fridges_shared_list(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach($member->id, ['role' => 'member']);

        $response = $this->actingAs($member)->postJson("/api/fridges/{$fridge->id}/shopping-items", [
            'name' => 'Bread',
            'icon' => 'bread',
            'section' => 'bakery',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['name' => 'Bread', 'checked' => false, 'fridgeId' => (string) $fridge->id, 'fridgeName' => 'Shared']]);
        $this->assertDatabaseHas('shopping_items', ['fridge_id' => $fridge->id, 'name' => 'Bread']);
    }

    public function test_a_non_member_cannot_add_an_item(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $this->actingAs($stranger)->postJson("/api/fridges/{$fridge->id}/shopping-items", ['name' => 'Bread', 'section' => 'bakery'])
            ->assertStatus(403);
    }

    public function test_store_accepts_and_returns_a_shop_url(): void
    {
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $response = $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/shopping-items", [
            'name' => 'Milk',
            'section' => 'dairy',
            'shopUrl' => 'https://example.com/milk',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['shopUrl' => 'https://example.com/milk']]);
        $this->assertDatabaseHas('shopping_items', ['name' => 'Milk', 'shop_url' => 'https://example.com/milk']);
    }

    public function test_store_rejects_an_invalid_shop_url(): void
    {
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);

        $response = $this->actingAs($owner)->postJson("/api/fridges/{$fridge->id}/shopping-items", [
            'name' => 'Milk',
            'section' => 'dairy',
            'shopUrl' => 'not a url',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('shopUrl');
    }

    public function test_a_member_who_did_not_add_the_item_can_edit_and_delete_it(): void
    {
        // The crux of this change: like fridge notes, a shopping item is communal - any member
        // can act on any item, not just whoever added it.
        $owner = User::factory()->create();
        $adder = User::factory()->create();
        $otherMember = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $fridge->members()->attach([$adder->id => ['role' => 'member'], $otherMember->id => ['role' => 'member']]);
        $item = $fridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $toggleResponse = $this->actingAs($otherMember)->patchJson("/api/shopping-items/{$item->id}", ['checked' => true]);
        $toggleResponse->assertStatus(200);
        $this->assertDatabaseHas('shopping_items', ['id' => $item->id, 'checked' => true]);

        $deleteResponse = $this->actingAs($otherMember)->deleteJson("/api/shopping-items/{$item->id}");
        $deleteResponse->assertStatus(204);
        $this->assertDatabaseMissing('shopping_items', ['id' => $item->id]);
    }

    public function test_a_non_member_cannot_update_or_delete_an_item(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $item = $fridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $this->actingAs($stranger)->patchJson("/api/shopping-items/{$item->id}", ['checked' => true])->assertStatus(403);
        $this->actingAs($stranger)->deleteJson("/api/shopping-items/{$item->id}")->assertStatus(403);
    }

    public function test_update_can_set_and_clear_the_shop_url(): void
    {
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Shared']);
        $item = $fridge->shoppingItems()->create(['name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $setResponse = $this->actingAs($owner)->patchJson("/api/shopping-items/{$item->id}", ['shopUrl' => 'https://example.com/milk']);
        $setResponse->assertStatus(200);
        $setResponse->assertJson(['data' => ['shopUrl' => 'https://example.com/milk']]);

        $clearResponse = $this->actingAs($owner)->patchJson("/api/shopping-items/{$item->id}", ['shopUrl' => null]);
        $clearResponse->assertStatus(200);
        $clearResponse->assertJson(['data' => ['shopUrl' => null]]);
    }
}
