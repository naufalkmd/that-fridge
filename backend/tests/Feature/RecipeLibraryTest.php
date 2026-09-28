<?php

namespace Tests\Feature;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecipeLibraryTest extends TestCase
{
    use RefreshDatabase;

    private function recipe(?User $owner, string $name, ?string $exploreStatus = null): Recipe
    {
        $r = Recipe::create(['user_id' => $owner?->id, 'name' => $name, 'minutes' => 20, 'category' => 'dinner',
            'ingredients' => [['name' => 'Egg', 'icon' => 'eggs']], 'steps' => ['Cook it.']]);
        if ($exploreStatus) {
            ExploreItem::create(['type' => 'recipe', 'ref_id' => $r->id, 'title' => $name, 'status' => $exploreStatus]);
        }

        return $r;
    }

    public function test_the_book_is_only_your_recipes_and_your_favourites(): void
    {
        $me = User::factory()->create();
        $this->recipe($me, 'My omelette');
        $this->recipe(null, 'Curated curry', 'published');
        $starred = $this->recipe(null, 'Curated laksa', 'published');
        $me->favoriteRecipes()->attach($starred->id);

        $names = collect($this->actingAs($me)->getJson('/api/recipes')->assertOk()->json('data'))->pluck('name')->all();

        $this->assertSame(['Curated laksa', 'My omelette'], $names);
    }

    public function test_the_crew_draws_on_the_library_but_not_on_drafts_or_hidden_recipes(): void
    {
        $me = User::factory()->create();
        $this->recipe($me, 'Mine');
        $this->recipe(null, 'Old curated'); // predates Explore entries
        $this->recipe(null, 'Published import', 'published');
        $this->recipe(null, 'Waiting import', 'draft');
        $this->recipe(null, 'Hidden one', 'hidden');
        $this->recipe(User::factory()->create(), 'Someone else');

        $names = Recipe::query()->usableBy($me)->orderBy('name')->pluck('name')->all();

        $this->assertSame(['Mine', 'Old curated', 'Published import'], $names);
    }

    public function test_every_curated_recipe_gets_a_published_explore_entry(): void
    {
        $bare = $this->recipe(null, 'Bare curated');
        $hidden = $this->recipe(null, 'Kept hidden', 'hidden');
        $this->recipe(User::factory()->create(), 'User recipe');

        (require database_path('migrations/2026_09_29_000006_list_curated_recipes_in_explore.php'))->up();

        $this->assertSame('published', ExploreItem::where('ref_id', $bare->id)->value('status'));
        $this->assertSame('hidden', ExploreItem::where('ref_id', $hidden->id)->value('status')); // left alone
        $this->assertSame(2, ExploreItem::where('type', 'recipe')->count());
    }
}
