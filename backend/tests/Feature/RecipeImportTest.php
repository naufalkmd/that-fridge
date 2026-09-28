<?php

namespace Tests\Feature;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\User;
use App\Services\RecipeImport\RecipeImporter;
use App\Services\RecipeImport\RecipeImportRunner;
use App\Services\RecipeImport\TheMealDbSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RecipeImportTest extends TestCase
{
    use RefreshDatabase;

    private function meal(string $id, string $name, int $ingredients = 5, array $over = []): array
    {
        $m = [
            'idMeal' => $id, 'strMeal' => $name, 'strCategory' => 'Chicken', 'strArea' => 'Malaysian',
            'strInstructions' => "STEP 1\r\nHeat the oil in a large pan over a medium heat.\r\nSTEP 2\r\nAdd the chicken and fry until golden all over.\r\nStir in the curry paste and simmer for 20 minutes.",
            'strMealThumb' => "https://www.themealdb.com/images/{$id}.jpg",
            'strTags' => 'Curry,Spicy', 'strSource' => 'https://www.bbcgoodfood.com/recipes/chicken-curry',
        ];
        foreach (range(1, 20) as $i) {
            $m["strIngredient{$i}"] = $i <= $ingredients ? ['Chicken Thighs', 'Onion', 'Garlic', 'Coconut Milk', 'Curry Paste', 'Rice', 'Lime'][$i - 1] ?? "Spice {$i}" : '';
            $m["strMeasure{$i}"] = $i <= $ingredients ? '1 tbsp' : '';
        }

        return array_merge($m, $over);
    }

    private function fakeApi(array $mealsForA): void
    {
        Http::fake(function ($request) use ($mealsForA) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);

            return Http::response(['meals' => ($q['f'] ?? '') === 'a' ? $mealsForA : null], 200);
        });
    }

    public function test_it_imports_as_curated_recipes_with_credit_and_draft_explore_entries(): void
    {
        $this->fakeApi([$this->meal('52772', 'Ayam Masak Merah')]);

        $this->artisan('app:import-recipes', ['--limit' => 5])->assertSuccessful();

        $recipe = Recipe::where('external_id', 'themealdb:52772')->firstOrFail();
        $this->assertNull($recipe->user_id);
        $this->assertSame('https://www.bbcgoodfood.com/recipes/chicken-curry', $recipe->source_url);
        $this->assertSame('bbcgoodfood.com', $recipe->source_name);
        $this->assertStringStartsWith("You'll need: 1 tbsp chicken thighs", $recipe->steps[0]);
        $this->assertSame('Heat the oil in a large pan over a medium heat.', $recipe->steps[1]); // "STEP 1" labels dropped
        $this->assertSame('dinner', $recipe->category);
        $this->assertSame([['type' => 'image', 'url' => 'https://www.themealdb.com/images/52772.jpg']], $recipe->attachments);

        $item = ExploreItem::where('ref_id', $recipe->id)->firstOrFail();
        $this->assertSame('draft', $item->status); // waits for an admin
        $this->assertContains('malaysian', $item->tags);
    }

    public function test_it_skips_what_is_already_here_near_duplicates_and_thin_recipes(): void
    {
        Recipe::create(['user_id' => null, 'name' => 'Chicken curry', 'minutes' => 30, 'category' => 'dinner',
            'ingredients' => [['name' => 'Chicken thighs', 'icon' => 'meat'], ['name' => 'Onion', 'icon' => 'x'], ['name' => 'Garlic', 'icon' => 'x'], ['name' => 'Coconut milk', 'icon' => 'x']], 'steps' => ['a', 'b']]);
        $importer = app(RecipeImporter::class);

        Http::fake(fn () => Http::response(['meals' => [
            $this->meal('1', 'Chicken Curry!'),              // same name once cleaned
            $this->meal('2', 'Chicken curry', 2),            // too few ingredients (and a duplicate)
            $this->meal('3', 'Nasi lemak', 5, ['strInstructions' => 'Cook.']), // no real steps
            $this->meal('4', 'Beef rendang'),
        ]], 200));
        $results = array_map(fn ($r) => $importer->import($r), app(TheMealDbSource::class)->byLetter('x'));

        $this->assertSame(['duplicate', 'low_quality', 'low_quality', 'imported'], $results);
        $this->assertSame('exists', $importer->import(app(TheMealDbSource::class)->byLetter('x')[3]));
    }

    public function test_each_run_carries_on_from_where_the_last_stopped(): void
    {
        $this->fakeApi([$this->meal('1', 'Apam balik'), $this->meal('2', 'Asam pedas'), $this->meal('3', 'Ayam goreng')]);
        Cache::forget(RecipeImportRunner::CURSOR_KEY);

        $this->artisan('app:import-recipes', ['--limit' => 2])->assertSuccessful();
        $this->assertSame(2, Recipe::count());
        $this->assertSame(0, Cache::get(RecipeImportRunner::CURSOR_KEY)); // letter "a" not finished yet

        $this->artisan('app:import-recipes', ['--limit' => 2])->assertSuccessful();
        $this->assertSame(3, Recipe::count());
    }

    public function test_steps_fall_back_to_sentence_pairs_for_one_long_paragraph(): void
    {
        $steps = RecipeImporter::steps('Boil the water. Add the pasta. Cook for ten minutes. Drain and serve with sauce.');

        $this->assertSame(['Boil the water. Add the pasta.', 'Cook for ten minutes. Drain and serve with sauce.'], $steps);
    }

    public function test_the_recipe_api_includes_the_credit(): void
    {
        $user = User::factory()->create();
        $recipe = Recipe::create(['user_id' => null, 'name' => 'Laksa', 'minutes' => 30, 'category' => 'dinner', 'ingredients' => [], 'steps' => [],
            'source_url' => 'https://example.com/laksa', 'source_name' => 'example.com', 'author' => 'Chef Wan']);

        $this->actingAs($user)->getJson("/api/recipes/{$recipe->id}")
            ->assertOk()
            ->assertJsonPath('data.sourceUrl', 'https://example.com/laksa')
            ->assertJsonPath('data.author', 'Chef Wan');
    }
}
