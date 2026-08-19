<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_search_requires_authentication(): void
    {
        $response = $this->getJson('/api/users/search?q=jor');

        $response->assertStatus(401);
    }

    public function test_search_rejects_a_single_character_query(): void
    {
        $me = User::factory()->create();
        User::factory()->create(['username' => 'jordan_diaz']);

        $response = $this->actingAs($me)->getJson('/api/users/search?q=j');

        $response->assertStatus(422);
    }

    public function test_search_matches_by_username_prefix(): void
    {
        $me = User::factory()->create();
        User::factory()->create(['username' => 'jordan_diaz']);
        User::factory()->create(['username' => 'jordan_lee']);
        User::factory()->create(['username' => 'riley']);

        $response = $this->actingAs($me)->getJson('/api/users/search?q=jordan');

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data');
        $usernames = collect($response->json('data'))->pluck('username')->all();
        $this->assertEqualsCanonicalizing(['jordan_diaz', 'jordan_lee'], $usernames);
    }

    public function test_search_excludes_the_current_user(): void
    {
        $me = User::factory()->create(['username' => 'jordan_self']);

        $response = $this->actingAs($me)->getJson('/api/users/search?q=jordan');

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'data');
    }

    public function test_search_results_never_include_email(): void
    {
        $me = User::factory()->create();
        User::factory()->create(['username' => 'jordan_diaz', 'email' => 'secret@example.com']);

        $response = $this->actingAs($me)->getJson('/api/users/search?q=jordan');

        $response->assertStatus(200);
        $response->assertJsonMissingPath('data.0.email');
    }

    public function test_profile_shows_only_fridges_the_target_owns_not_ones_they_merely_joined(): void
    {
        $viewer = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        $otherOwner = User::factory()->create();

        $owned = Fridge::create(['user_id' => $target->id, 'name' => "Jordan's Kitchen"]);
        $joinedOnly = Fridge::create(['user_id' => $otherOwner->id, 'name' => 'Not Jordans']);
        $joinedOnly->members()->attach($target->id, ['role' => 'member']);

        $response = $this->actingAs($viewer)->getJson('/api/users/jordan/profile');

        $response->assertStatus(200);
        $fridgeNames = collect($response->json('data.fridges'))->pluck('name')->all();
        $this->assertEquals(["Jordan's Kitchen"], $fridgeNames);
    }

    public function test_profile_includes_member_count_but_not_fridge_contents(): void
    {
        $viewer = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        $fridge = Fridge::create(['user_id' => $target->id, 'name' => "Jordan's Kitchen"]);
        $fridge->members()->attach(User::factory()->create()->id, ['role' => 'member']);

        $response = $this->actingAs($viewer)->getJson('/api/users/jordan/profile');

        $response->assertStatus(200);
        $response->assertJson(['data' => ['fridges' => [['memberCount' => 2]]]]);
        $response->assertJsonMissingPath('data.fridges.0.sections');
    }

    public function test_profile_reflects_the_viewers_own_role_and_pending_request_status(): void
    {
        $viewer = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        $memberFridge = Fridge::create(['user_id' => $target->id, 'name' => 'Already In']);
        $memberFridge->members()->attach($viewer->id, ['role' => 'member']);
        $requestedFridge = Fridge::create(['user_id' => $target->id, 'name' => 'Requested']);
        FridgeJoinRequest::create(['fridge_id' => $requestedFridge->id, 'requester_id' => $viewer->id, 'status' => 'pending']);
        $untouchedFridge = Fridge::create(['user_id' => $target->id, 'name' => 'Untouched']);

        $response = $this->actingAs($viewer)->getJson('/api/users/jordan/profile');

        $response->assertStatus(200);
        $byName = collect($response->json('data.fridges'))->keyBy('name');
        $this->assertEquals('member', $byName['Already In']['role']);
        $this->assertNull($byName['Already In']['requestStatus']);
        $this->assertNull($byName['Requested']['role']);
        $this->assertEquals('pending', $byName['Requested']['requestStatus']);
        $this->assertNull($byName['Untouched']['role']);
        $this->assertNull($byName['Untouched']['requestStatus']);
    }

    public function test_profile_shows_the_targets_custom_recipes_but_not_curated_ones(): void
    {
        $viewer = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        Recipe::create([
            'user_id' => $target->id, 'name' => "Jordan's Chili", 'minutes' => 30,
            'ingredients' => [['name' => 'Beans', 'icon' => 'leftovers']], 'steps' => ['Cook it'],
        ]);
        Recipe::create([
            'user_id' => null, 'name' => 'Curated Chili', 'minutes' => 30,
            'ingredients' => [['name' => 'Beans', 'icon' => 'leftovers']], 'steps' => ['Cook it'],
        ]);

        $response = $this->actingAs($viewer)->getJson('/api/users/jordan/profile');

        $response->assertStatus(200);
        $names = collect($response->json('data.recipes'))->pluck('name');
        $this->assertEquals(["Jordan's Chili"], $names->all());
    }

    public function test_profile_recipes_reflect_the_viewers_own_favorite_and_mine_status(): void
    {
        $viewer = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        $recipe = Recipe::create([
            'user_id' => $target->id, 'name' => "Jordan's Chili", 'minutes' => 30,
            'ingredients' => [['name' => 'Beans', 'icon' => 'leftovers']], 'steps' => ['Cook it'],
        ]);
        $viewer->favoriteRecipes()->attach($recipe->id);

        $response = $this->actingAs($viewer)->getJson('/api/users/jordan/profile');

        $response->assertStatus(200);
        $response->assertJson(['data' => ['recipes' => [['isFavorite' => true, 'isMine' => false, 'ownerUsername' => 'jordan']]]]);
    }
}
