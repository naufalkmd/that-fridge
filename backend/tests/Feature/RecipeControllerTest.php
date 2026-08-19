<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecipeControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_tags_the_recipe_using_the_mock_fallback_when_no_api_key(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Weeknight Pasta',
            'minutes' => 20,
            'ingredients' => [['name' => 'Pasta', 'icon' => 'leftovers']],
            'steps' => ['Boil it', 'Eat it'],
        ]);

        $response->assertStatus(201);
        $response->assertJson(['data' => ['mealType' => 'dinner', 'vibes' => [], 'foodFocus' => ['balanced'], 'madeCount' => 0]]);
    }

    private function recipeFor(?User $user, array $overrides = []): Recipe
    {
        return Recipe::create(array_merge([
            'user_id' => $user?->id,
            'name' => 'Test Recipe',
            'minutes' => 20,
            'ingredients' => [['name' => 'Spinach', 'icon' => 'spinach']],
            'steps' => ['Cook it'],
            'meal_type' => 'dinner',
            'vibes' => [],
            'food_focus' => [],
            'made_count' => 0,
        ], $overrides));
    }

    public function test_suggest_hard_filters_by_meal_type(): void
    {
        $user = User::factory()->create();
        $breakfast = $this->recipeFor($user, ['name' => 'Oats', 'meal_type' => 'breakfast', 'vibes' => ['comfort']]);
        $dinner = $this->recipeFor($user, ['name' => 'Stew', 'meal_type' => 'dinner', 'vibes' => ['comfort']]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?meal_type=breakfast&vibes[]=comfort');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertTrue($names->contains('Oats'));
        $this->assertFalse($names->contains('Stew'));
    }

    public function test_suggest_hard_filters_by_food_focus(): void
    {
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Protein Bowl', 'food_focus' => ['high_protein'], 'vibes' => ['comfort']]);
        $this->recipeFor($user, ['name' => 'Veg Bowl', 'food_focus' => ['high_veg'], 'vibes' => ['comfort']]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=comfort&food_focus[]=high_protein');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertEquals(['Protein Bowl'], $names->all());
    }

    public function test_suggest_with_only_a_food_focus_selected_still_returns_matches(): void
    {
        // Regression: food_focus used to be a hard filter only, never scored - a recipe that
        // survived the filter still landed on a flat 0 and got dropped by the score > 0 cutoff,
        // so picking a food_focus chip with no vibe selected always came back empty even when a
        // real match existed.
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Protein Bowl', 'food_focus' => ['high_protein'], 'vibes' => []]);
        $this->recipeFor($user, ['name' => 'Veg Bowl', 'food_focus' => ['high_veg'], 'vibes' => []]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?food_focus[]=high_protein');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertEquals(['Protein Bowl'], $names->all());
        $this->assertFalse($response->json('exhausted'));
    }

    public function test_suggest_with_only_a_meal_type_selected_still_returns_matches(): void
    {
        // Regression: with no vibes and no food_focus selected there was nothing to score, so
        // every candidate scored 0 and got dropped - a bare meal_type search always came back
        // empty even when matching recipes existed.
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Pancakes', 'meal_type' => 'breakfast', 'vibes' => []]);
        $this->recipeFor($user, ['name' => 'Stew', 'meal_type' => 'dinner', 'vibes' => []]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?meal_type=breakfast');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertEquals(['Pancakes'], $names->all());
        $this->assertFalse($response->json('exhausted'));
    }

    public function test_suggest_scores_tag_vibe_matches(): void
    {
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Comfort Food', 'vibes' => ['comfort']]);
        $this->recipeFor($user, ['name' => 'Fresh Salad', 'vibes' => ['light_fresh']]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=comfort');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertTrue($names->contains('Comfort Food'));
        $this->assertFalse($names->contains('Fresh Salad'));
    }

    public function test_suggest_scores_something_new_by_zero_made_count(): void
    {
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Never Made', 'made_count' => 0]);
        $this->recipeFor($user, ['name' => 'Made Before', 'made_count' => 3]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=something_new');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertEquals(['Never Made'], $names->all());
    }

    private function itemExpiringIn(User $user, string $icon, int $days): void
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
        $section->items()->create([
            'name' => ucfirst($icon),
            'icon' => $icon,
            'location' => 'fridge',
            'quantity' => 1,
            'expiry_date' => now()->addDays($days)->toDateString(),
            'shelf_life_days' => 30,
        ]);
    }

    public function test_suggest_scores_use_it_up_by_expiring_overlap(): void
    {
        $user = User::factory()->create();
        $this->itemExpiringIn($user, 'spinach', 1); // matches the recipeFor() default ingredient icon
        $usesExpiring = $this->recipeFor($user, ['name' => 'Uses Expiring']);
        $doesNot = $this->recipeFor($user, ['name' => 'No Overlap', 'ingredients' => [['name' => 'Rice', 'icon' => 'leftovers']]]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=use_it_up');

        $names = collect($response->json('exact'))->pluck('name');
        $this->assertTrue($names->contains('Uses Expiring'));
        $this->assertFalse($names->contains('No Overlap'));
    }

    public function test_suggest_puts_relaxed_matches_in_the_similar_bucket_not_exact(): void
    {
        $user = User::factory()->create();
        // Nothing matches lunch exactly, but this still matches the vibe once meal_type is
        // dropped - it should show up as "similar", not silently promoted into "exact".
        $this->recipeFor($user, ['name' => 'Dinner Comfort', 'meal_type' => 'dinner', 'vibes' => ['comfort']]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?meal_type=lunch&vibes[]=comfort');

        $this->assertEquals([], $response->json('exact'));
        $this->assertFalse($response->json('exhausted'));
        $names = collect($response->json('similar'))->pluck('name');
        $this->assertEquals(['Dinner Comfort'], $names->all());
    }

    public function test_suggest_returns_similar_matches_alongside_a_thin_exact_list(): void
    {
        // The actual ask: even when there ARE exact matches (just not many), still surface
        // recipes that are close but not a perfect fit, in a separate, clearly distinct bucket.
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Exact Match', 'meal_type' => 'dinner', 'vibes' => ['comfort']]);
        $this->recipeFor($user, ['name' => 'Close But Wrong Meal', 'meal_type' => 'lunch', 'vibes' => ['comfort']]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?meal_type=dinner&vibes[]=comfort');

        $exactNames = collect($response->json('exact'))->pluck('name');
        $similarNames = collect($response->json('similar'))->pluck('name');
        $this->assertEquals(['Exact Match'], $exactNames->all());
        $this->assertEquals(['Close But Wrong Meal'], $similarNames->all());
    }

    public function test_suggest_has_no_similar_tier_for_a_bare_meal_type_search(): void
    {
        // Nothing to judge "similarity" by once the one filter that was picked is dropped.
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Pancakes', 'meal_type' => 'breakfast']);
        $this->recipeFor($user, ['name' => 'Stew', 'meal_type' => 'dinner']);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?meal_type=breakfast');

        $this->assertEquals([], $response->json('similar'));
    }

    public function test_suggest_reports_exhausted_when_nothing_matches_at_all(): void
    {
        $user = User::factory()->create();
        $this->recipeFor($user, ['name' => 'Irrelevant', 'vibes' => []]);

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=comfort');

        $this->assertTrue($response->json('exhausted'));
        $this->assertEquals([], $response->json('exact'));
        $this->assertEquals([], $response->json('similar'));
    }

    public function test_mark_made_increments_made_count(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipeFor($user, ['made_count' => 2]);

        $response = $this->actingAs($user)->postJson("/api/recipes/{$recipe->id}/mark-made");

        $response->assertJson(['data' => ['madeCount' => 3]]);
        $this->assertDatabaseHas('recipes', ['id' => $recipe->id, 'made_count' => 3]);
    }

    public function test_suggest_returns_more_than_three_matches_for_the_frontend_to_shuffle_through(): void
    {
        $user = User::factory()->create();
        for ($i = 1; $i <= 6; $i++) {
            $this->recipeFor($user, ['name' => "Comfort Food {$i}", 'vibes' => ['comfort']]);
        }

        $response = $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=comfort');

        $this->assertCount(6, $response->json('exact'));
    }

    public function test_a_user_can_favorite_another_users_custom_recipe(): void
    {
        $owner = User::factory()->create();
        $favoriter = User::factory()->create();
        $recipe = $this->recipeFor($owner);

        $response = $this->actingAs($favoriter)->postJson("/api/recipes/{$recipe->id}/favorite");

        $response->assertStatus(200);
        $response->assertJson(['data' => ['isFavorite' => true, 'isMine' => false]]);
        $this->assertDatabaseHas('recipe_favorites', ['user_id' => $favoriter->id, 'recipe_id' => $recipe->id]);
    }

    public function test_a_user_can_unfavorite_another_users_custom_recipe(): void
    {
        $owner = User::factory()->create();
        $favoriter = User::factory()->create();
        $recipe = $this->recipeFor($owner);
        $favoriter->favoriteRecipes()->attach($recipe->id);

        $response = $this->actingAs($favoriter)->deleteJson("/api/recipes/{$recipe->id}/favorite");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('recipe_favorites', ['user_id' => $favoriter->id, 'recipe_id' => $recipe->id]);
    }

    public function test_a_user_still_cannot_update_or_delete_someone_elses_recipe(): void
    {
        // Regression guard: broadening RecipePolicy::view() to unconditionally true (so
        // favorite/unfavorite/markMade work on anyone's recipe) must not have loosened
        // update/delete, which stay owner-only.
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $recipe = $this->recipeFor($owner);

        $this->actingAs($other)->patchJson("/api/recipes/{$recipe->id}", ['name' => 'Hijacked'])->assertStatus(403);
        $this->actingAs($other)->deleteJson("/api/recipes/{$recipe->id}")->assertStatus(403);
    }

    public function test_index_includes_a_favorited_recipe_from_another_user_but_not_an_unfavorited_one(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $favorited = $this->recipeFor($owner, ['name' => 'Favorited From Owner']);
        $untouched = $this->recipeFor($owner, ['name' => 'Never Favorited']);
        $viewer->favoriteRecipes()->attach($favorited->id);

        $response = $this->actingAs($viewer)->getJson('/api/recipes');

        $names = collect($response->json('data'))->pluck('name');
        $this->assertTrue($names->contains('Favorited From Owner'));
        $this->assertFalse($names->contains('Never Favorited'));
    }

    public function test_recipe_resource_reports_owner_name_for_a_custom_recipe_and_null_for_curated(): void
    {
        $owner = User::factory()->create(['name' => 'Jordan Diaz', 'username' => 'jordan_diaz']);
        $viewer = User::factory()->create();
        $custom = $this->recipeFor($owner, ['name' => "Jordan's Chili"]);
        $curated = $this->recipeFor(null, ['name' => 'Curated Chili']);

        $customResponse = $this->actingAs($viewer)->postJson("/api/recipes/{$custom->id}/favorite");
        $curatedResponse = $this->actingAs($viewer)->postJson("/api/recipes/{$curated->id}/favorite");

        $customResponse->assertJson(['data' => ['ownerUsername' => 'jordan_diaz', 'ownerName' => 'Jordan Diaz']]);
        $curatedResponse->assertJson(['data' => ['ownerUsername' => null, 'ownerName' => null]]);
    }
}
