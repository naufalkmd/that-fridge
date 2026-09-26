<?php

namespace Tests\Feature;

use App\Jobs\EstimateRecipeCalories;
use App\Models\Recipe;
use App\Models\User;
use App\Services\RecipeCalorieService;
use App\Support\RecipeCalories;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RecipeCaloriesTest extends TestCase
{
    use RefreshDatabase;

    private function ing(string ...$names): array
    {
        return array_map(fn ($n) => ['icon' => 'generic', 'name' => $n], $names);
    }

    private function recipe(array $ingredients, array $over = []): Recipe
    {
        $user = User::factory()->create();

        return $user->recipes()->create(array_merge([
            'name' => 'Test dish', 'minutes' => 20, 'ingredients' => $ingredients, 'steps' => ['Cook it.'],
            'vibes' => [], 'food_focus' => [], 'made_count' => 0,
        ], $over));
    }

    private function fakeAi(string $content): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => $content]]]], 200)]);
    }

    // ---- the algorithm ----------------------------------------------------------------------

    public function test_common_ingredients_resolve_to_sensible_per_serving_calories(): void
    {
        $cases = [
            'Eggs' => [107, 5], 'Carrots' => [33, 3], 'Spinach' => [14, 2], 'Tomatoes' => [18, 2],
            'Coconut milk' => [118, 3], 'Sweet potatoes' => [112, 3], 'Kangkung' => [15, 2],
            'Peas' => [49, 3], 'Peanut' => [113, 3], 'Oatmeal' => [152, 3],
            '2 cups rice' => [234, 3],            // a leading quantity is ignored: this is per serving
            '200g chicken breast' => [198, 3],
            'Salt and pepper' => [3, 1],          // "and" adds both
            'Chicken or beef' => [270, 5],        // "or" averages the alternatives
            'Chicken stock' => [10, 2],           // the longer keyword wins: stock, not chicken
            'Olive oil (extra virgin)' => [88, 2],
        ];
        foreach ($cases as $name => [$expected, $tolerance]) {
            $this->assertEqualsWithDelta($expected, RecipeCalories::ingredientKcal($name), $tolerance, $name);
        }
    }

    public function test_whole_word_matching_avoids_substring_traps(): void
    {
        // "oat" inside "goat", "ham" inside "hamburger", "pea" inside "peanut" / "pear" must not match
        // the wrong ingredient (the icon matcher's plain-substring matching would).
        $this->assertNull(RecipeCalories::ingredientKcal('Goat'));
        $this->assertNull(RecipeCalories::ingredientKcal('Hamburger'));
        $this->assertEqualsWithDelta(66, RecipeCalories::ingredientKcal('Pear'), 2);  // pear, not pea
        $this->assertNull(RecipeCalories::ingredientKcal('Unobtainium powder'));
        $this->assertNull(RecipeCalories::ingredientKcal('   '));
    }

    public function test_an_unknown_name_falls_back_to_a_curated_icon_hint(): void
    {
        $this->assertNull(RecipeCalories::ingredientKcal('Something obscure', 'generic'));
        $this->assertEqualsWithDelta(107, RecipeCalories::ingredientKcal('Something obscure', 'eggs'), 3);
    }

    public function test_estimate_reports_coverage_and_the_unrecognised_names(): void
    {
        $est = RecipeCalories::estimate($this->ing('Carrots', 'Spinach', 'Eggs', 'Zorblax'));

        $this->assertSame(4, $est['total']);
        $this->assertSame(3, $est['matched']);
        $this->assertSame(['Zorblax'], $est['unmatched']);
        $this->assertEqualsWithDelta(33 + 14 + 107, $est['kcal'], 5);
        $this->assertSame(0, RecipeCalories::estimate([])['total']);
    }

    // ---- saving a recipe ----------------------------------------------------------------------

    public function test_a_well_covered_recipe_gets_a_table_number_and_never_calls_the_model(): void
    {
        Http::fake();
        config(['services.openrouter.key' => 'test-key']);
        Queue::fake();

        $recipe = $this->recipe($this->ing('Carrots', 'Spinach', 'Eggs', 'Chicken or beef', 'Soy sauce'));

        $this->assertSame('algorithm', $recipe->calories_source);
        $this->assertEqualsWithDelta(33 + 14 + 107 + 270 + 5, $recipe->calories, 10);
        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_a_poorly_covered_recipe_gets_a_stop_gap_and_is_handed_to_the_model(): void
    {
        Queue::fake();

        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry', 'Eggs'));

        $this->assertSame('rough', $recipe->calories_source);
        $this->assertGreaterThan(0, $recipe->calories);
        Queue::assertPushed(EstimateRecipeCalories::class, fn ($job) => $job->recipeId === $recipe->id);
    }

    /** @return array<string, array{0: string, 1: int}> */
    public static function modelAnswers(): array
    {
        return [
            'a normal answer' => ['{"servings": 4, "calories": 520}', 520],
            'wrapped in a code fence' => ["```json\n{\"servings\": 4, \"calories\": 480}\n```", 480],
            'absurdly high is clamped' => ['{"servings": 1, "calories": 90000}', 3000],
            'absurdly low is clamped' => ['{"servings": 1, "calories": 2}', 30],
            'a numeric string is accepted' => ['{"servings": 2, "calories": "350"}', 350],
        ];
    }

    #[DataProvider('modelAnswers')]
    public function test_the_model_number_replaces_the_stop_gap_and_is_clamped(string $answer, int $expected): void
    {
        $this->fakeAi($answer);

        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry', 'Eggs')); // sync queue: the job runs now

        $this->assertSame($expected, $recipe->fresh()->calories);
        $this->assertSame('ai', $recipe->fresh()->calories_source);
    }

    public function test_an_unusable_model_answer_leaves_the_stop_gap(): void
    {
        $this->fakeAi('I think about 400 calories');

        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry'));

        $this->assertSame('rough', $recipe->fresh()->calories_source);
    }

    public function test_a_failing_model_leaves_the_stop_gap(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response('nope', 500)]);

        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry'));

        $this->assertSame('rough', $recipe->fresh()->calories_source);
    }

    public function test_no_api_key_leaves_the_stop_gap_without_any_request(): void
    {
        config(['services.openrouter.key' => null]);
        Http::fake();

        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry'));

        $this->assertSame('rough', $recipe->fresh()->calories_source);
        Http::assertNothingSent();
    }

    public function test_changing_the_ingredients_recomputes_but_other_edits_do_not(): void
    {
        $recipe = $this->recipe($this->ing('Carrots', 'Spinach'));
        $before = $recipe->calories;

        $recipe->update(['name' => 'Renamed', 'minutes' => 5]);
        $this->assertSame($before, $recipe->fresh()->calories);

        $recipe->update(['ingredients' => $this->ing('Carrots', 'Spinach', 'Chicken breast')]);
        $this->assertGreaterThan($before + 150, $recipe->fresh()->calories);

        $recipe->increment('made_count'); // marking made must never trigger a recompute or a model call
        $this->assertSame($recipe->fresh()->calories, $recipe->fresh()->calories);
    }

    public function test_a_model_number_survives_unrelated_saves_but_new_ingredients_start_over(): void
    {
        $this->fakeAi('{"servings": 4, "calories": 520}');
        $recipe = $this->recipe($this->ing('Zorblax', 'Quuxberry', 'Eggs'));
        $this->assertSame('ai', $recipe->fresh()->calories_source);

        $recipe->fresh()->update(['name' => 'Renamed']);
        $this->assertSame(520, $recipe->fresh()->calories);

        Http::fake();
        $recipe->fresh()->update(['ingredients' => $this->ing('Carrots', 'Spinach', 'Eggs')]);
        $this->assertSame('algorithm', $recipe->fresh()->calories_source);
    }

    public function test_the_job_only_refines_a_stop_gap_and_tolerates_a_missing_recipe(): void
    {
        Queue::fake();
        $done = $this->recipe($this->ing('Carrots', 'Spinach', 'Eggs'));
        $this->fakeAi('{"servings": 2, "calories": 999}');

        (new EstimateRecipeCalories($done->id))->handle(app(RecipeCalorieService::class));
        (new EstimateRecipeCalories(999999))->handle(app(RecipeCalorieService::class));

        $this->assertSame('algorithm', $done->fresh()->calories_source);
        Http::assertNothingSent();
    }

    // ---- API ------------------------------------------------------------------------------------

    public function test_the_api_returns_calories_and_ignores_a_client_supplied_number(): void
    {
        $user = User::factory()->create();
        $res = $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Egg rice', 'minutes' => 10, 'ingredients' => $this->ing('Eggs', 'Rice', 'Soy sauce'),
            'steps' => ['Cook'], 'calories' => 9999, 'calories_source' => 'manual',
        ])->assertCreated();

        $this->assertSame('algorithm', $res->json('data.caloriesSource'));
        $this->assertEqualsWithDelta(107 + 234 + 5, $res->json('data.calories'), 10);
        $this->getJson('/api/recipes/'.$res->json('data.id'))->assertOk()->assertJsonPath('data.caloriesSource', 'algorithm');
    }

    // ---- backfill / sweeper ------------------------------------------------------------------------

    private function uncounted(array $ingredients): Recipe
    {
        return Recipe::withoutEvents(fn () => $this->recipe($ingredients)); // as an existing pre-feature row
    }

    public function test_the_command_backfills_missing_numbers_with_the_table_and_is_idempotent(): void
    {
        Http::fake();
        $good = $this->uncounted($this->ing('Carrots', 'Spinach', 'Eggs'));
        $poor = $this->uncounted($this->ing('Zorblax', 'Quuxberry'));
        $this->assertNull($good->fresh()->calories);

        $this->artisan('app:fill-recipe-calories', ['--no-ai' => true])->assertSuccessful();

        $this->assertSame('algorithm', $good->fresh()->calories_source);
        $this->assertSame('rough', $poor->fresh()->calories_source);
        Http::assertNothingSent();

        $before = $good->fresh()->updated_at;
        $this->artisan('app:fill-recipe-calories', ['--no-ai' => true])->assertSuccessful();
        $this->assertEquals($before, $good->fresh()->updated_at); // nothing left to do
    }

    public function test_the_command_asks_the_model_for_stop_gaps_and_respects_the_limit(): void
    {
        $this->fakeAi('{"servings": 3, "calories": 410}');
        $a = $this->uncounted($this->ing('Zorblax', 'Quuxberry'));
        $b = $this->uncounted($this->ing('Zorblax', 'Frobnicate'));

        $this->artisan('app:fill-recipe-calories', ['--limit' => 1])->assertSuccessful();
        $this->assertSame('ai', $a->fresh()->calories_source);
        $this->assertNull($b->fresh()->calories); // beyond the limit, waits for the next run

        $this->artisan('app:fill-recipe-calories')->assertSuccessful();
        $this->assertSame(410, $b->fresh()->calories);
    }

    public function test_recompute_redoes_every_recipe_from_its_ingredients(): void
    {
        Http::fake();
        $recipe = $this->recipe($this->ing('Carrots', 'Spinach', 'Eggs'));
        $recipe->forceFill(['calories' => 1, 'calories_source' => 'algorithm'])->saveQuietly();

        $this->artisan('app:fill-recipe-calories', ['--recompute' => true, '--no-ai' => true])->assertSuccessful();

        $this->assertGreaterThan(100, $recipe->fresh()->calories);
    }
}
