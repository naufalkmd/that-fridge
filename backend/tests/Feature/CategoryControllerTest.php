<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_create_list_and_delete_categories(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)->postJson('/api/categories', ['name' => 'Meal prep'])
            ->assertStatus(201)
            ->assertJson(['data' => ['name' => 'Meal prep', 'position' => 1]]);

        $this->actingAs($user)->postJson('/api/categories', ['name' => 'Snacks'])->assertStatus(201);

        $this->actingAs($user)->getJson('/api/categories')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Meal prep');

        $id = Category::where('name', 'Snacks')->value('id');
        $this->actingAs($user)->deleteJson("/api/categories/{$id}")->assertNoContent();
        $this->assertDatabaseMissing('categories', ['id' => $id]);
    }

    public function test_category_names_are_unique_per_user_but_not_globally(): void
    {
        $a = $this->createUser();
        $b = $this->createUser();

        $this->actingAs($a)->postJson('/api/categories', ['name' => 'Baby food'])->assertStatus(201);
        $this->actingAs($a)->postJson('/api/categories', ['name' => 'Baby food'])
            ->assertStatus(422)->assertJsonValidationErrors('name');

        // A different user can reuse the name.
        $this->actingAs($b)->postJson('/api/categories', ['name' => 'Baby food'])->assertStatus(201);
    }

    public function test_a_user_cannot_edit_or_delete_another_users_category(): void
    {
        $owner = $this->createUser();
        $stranger = $this->createUser();
        $category = $owner->categories()->create(['name' => 'Private', 'position' => 1]);

        $this->actingAs($stranger)->patchJson("/api/categories/{$category->id}", ['name' => 'Hijacked'])->assertStatus(403);
        $this->actingAs($stranger)->deleteJson("/api/categories/{$category->id}")->assertStatus(403);
    }

    public function test_deleting_a_category_uncategorizes_its_items(): void
    {
        [$user, $section] = $this->userWithSection();
        $category = $user->categories()->create(['name' => 'Weeknight', 'position' => 1]);
        $item = $section->items()->create(['name' => 'Pasta', 'icon' => 'pasta', 'category_id' => $category->id]);

        $this->actingAs($user)->deleteJson("/api/categories/{$category->id}")->assertNoContent();

        $this->assertNull($item->fresh()->category_id);
    }

    public function test_bulk_category_assigns_many_items_and_skips_ones_the_user_cannot_touch(): void
    {
        [$user, $section] = $this->userWithSection();
        $category = $user->categories()->create(['name' => 'Batch', 'position' => 1]);
        $mine1 = $section->items()->create(['name' => 'Rice', 'icon' => 'rice']);
        $mine2 = $section->items()->create(['name' => 'Beans', 'icon' => 'beans']);

        $strangerFridge = Fridge::create(['user_id' => $this->createUser()->id, 'name' => 'Theirs']);
        $strangerSection = $strangerFridge->sections()->create(['name' => 'Main', 'position' => 0]);
        $notMine = $strangerSection->items()->create(['name' => 'Milk', 'icon' => 'milk']);

        $response = $this->actingAs($user)->patchJson('/api/items/bulk-category', [
            'item_ids' => [$mine1->id, $mine2->id, $notMine->id],
            'category_id' => $category->id,
        ]);

        $response->assertOk()->assertJson(['updated' => 2]);
        $this->assertEquals($category->id, $mine1->fresh()->category_id);
        $this->assertEquals($category->id, $mine2->fresh()->category_id);
        $this->assertNull($notMine->fresh()->category_id);
    }

    public function test_bulk_category_can_clear_the_category_with_null(): void
    {
        [$user, $section] = $this->userWithSection();
        $category = $user->categories()->create(['name' => 'X', 'position' => 1]);
        $item = $section->items()->create(['name' => 'Eggs', 'icon' => 'egg', 'category_id' => $category->id]);

        $this->actingAs($user)->patchJson('/api/items/bulk-category', [
            'item_ids' => [$item->id],
            'category_id' => null,
        ])->assertOk()->assertJson(['updated' => 1]);

        $this->assertNull($item->fresh()->category_id);
    }

    public function test_item_store_rejects_a_category_belonging_to_someone_else(): void
    {
        [$user, $section] = $this->userWithSection();
        $strangersCategory = $this->createUser()->categories()->create(['name' => 'Theirs', 'position' => 1]);

        $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Butter',
            'icon' => 'butter',
            'category_id' => $strangersCategory->id,
        ])->assertStatus(422)->assertJsonValidationErrors('category_id');
    }

    public function test_item_resource_exposes_category_id(): void
    {
        [$user, $section] = $this->userWithSection();
        $category = $user->categories()->create(['name' => 'Y', 'position' => 1]);
        $item = $section->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt', 'category_id' => $category->id]);

        $this->actingAs($user)->getJson("/api/fridges/{$section->fridge_id}")
            ->assertOk()
            ->assertJsonPath('data.sections.0.items.0.category_id', (string) $category->id);
    }

    private function createUser(): User
    {
        return User::factory()->create();
    }

    /** @return array{0: User, 1: Section} */
    private function userWithSection(): array
    {
        $user = $this->createUser();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = $fridge->sections()->create(['name' => 'Main', 'position' => 0]);

        return [$user, $section];
    }
}
