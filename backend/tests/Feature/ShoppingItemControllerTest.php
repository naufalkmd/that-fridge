<?php

namespace Tests\Feature;

use App\Models\ShoppingItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShoppingItemControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_list_their_own_shopping_items(): void
    {
        $user = User::factory()->create();
        ShoppingItem::create(['user_id' => $user->id, 'name' => 'Milk', 'section' => 'dairy', 'checked' => false]);
        ShoppingItem::create(['user_id' => User::factory()->create()->id, 'name' => 'Not mine', 'section' => 'other', 'checked' => false]);

        $response = $this->actingAs($user)->getJson('/api/shopping-items');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJson(['data' => [['name' => 'Milk']]]);
    }

    public function test_store_creates_a_shopping_item_for_the_current_user(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/shopping-items', [
            'name' => 'Bread',
            'icon' => 'bread',
            'section' => 'bakery',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['name' => 'Bread', 'checked' => false]]);
        $this->assertDatabaseHas('shopping_items', ['user_id' => $user->id, 'name' => 'Bread']);
    }

    public function test_store_accepts_and_returns_a_shop_url(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/shopping-items', [
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
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/shopping-items', [
            'name' => 'Milk',
            'section' => 'dairy',
            'shopUrl' => 'not a url',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('shopUrl');
    }

    public function test_update_can_set_and_clear_the_shop_url(): void
    {
        $user = User::factory()->create();
        $item = ShoppingItem::create(['user_id' => $user->id, 'name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $setResponse = $this->actingAs($user)->patchJson("/api/shopping-items/{$item->id}", ['shopUrl' => 'https://example.com/milk']);
        $setResponse->assertStatus(200);
        $setResponse->assertJson(['data' => ['shopUrl' => 'https://example.com/milk']]);

        $clearResponse = $this->actingAs($user)->patchJson("/api/shopping-items/{$item->id}", ['shopUrl' => null]);
        $clearResponse->assertStatus(200);
        $clearResponse->assertJson(['data' => ['shopUrl' => null]]);
    }

    public function test_update_can_toggle_checked(): void
    {
        $user = User::factory()->create();
        $item = ShoppingItem::create(['user_id' => $user->id, 'name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $response = $this->actingAs($user)->patchJson("/api/shopping-items/{$item->id}", ['checked' => true]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('shopping_items', ['id' => $item->id, 'checked' => true]);
    }

    public function test_a_user_cannot_update_or_delete_someone_elses_shopping_item(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $item = ShoppingItem::create(['user_id' => $owner->id, 'name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $this->actingAs($other)->patchJson("/api/shopping-items/{$item->id}", ['checked' => true])->assertStatus(403);
        $this->actingAs($other)->deleteJson("/api/shopping-items/{$item->id}")->assertStatus(403);
    }

    public function test_destroy_deletes_the_shopping_item(): void
    {
        $user = User::factory()->create();
        $item = ShoppingItem::create(['user_id' => $user->id, 'name' => 'Milk', 'section' => 'dairy', 'checked' => false]);

        $response = $this->actingAs($user)->deleteJson("/api/shopping-items/{$item->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('shopping_items', ['id' => $item->id]);
    }
}
