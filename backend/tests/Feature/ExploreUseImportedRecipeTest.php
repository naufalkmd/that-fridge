<?php

namespace Tests\Feature;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExploreUseImportedRecipeTest extends TestCase
{
    use RefreshDatabase;

    public function test_saving_an_imported_recipe_from_explore_copies_it_with_its_credit(): void
    {
        $source = Recipe::create([
            'user_id' => null, 'external_id' => 'themealdb:52772', 'name' => 'Ayam masak merah', 'minutes' => 40, 'category' => 'dinner',
            'ingredients' => [['name' => 'Chicken thighs', 'icon' => 'icon14']], 'steps' => ["You'll need: chicken.", 'Cook it.'],
            'source_url' => 'https://example.com/ayam', 'source_name' => 'example.com',
        ]);
        $item = ExploreItem::create(['type' => 'recipe', 'ref_id' => $source->id, 'title' => 'Ayam masak merah', 'status' => 'published']);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson("/api/explore/{$item->id}/use")
            ->assertCreated()
            ->assertJsonPath('recipe.name', 'Ayam masak merah')
            ->assertJsonPath('recipe.sourceUrl', 'https://example.com/ayam');

        // And a second person can save it too.
        $this->actingAs(User::factory()->create())->postJson("/api/explore/{$item->id}/use")->assertCreated();

        $copy = Recipe::where('user_id', $user->id)->firstOrFail();
        $this->assertNull($copy->external_id); // only the imported original carries the source id
    }
}
