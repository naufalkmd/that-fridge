<?php

namespace App\Services;

use App\Models\Recipe;
use App\Support\RecipeCalories;
use Illuminate\Support\Facades\Log;

/**
 * Calories per serving for a recipe: the nutrition-table algorithm first (free, deterministic),
 * the model only when the table recognises too few ingredients. Recipes carry no quantities, so
 * both produce "one typical serving" - never a whole-pot total.
 */
class RecipeCalorieService
{
    /** Share of ingredients the table must recognise before its number is trusted on its own. */
    public const MIN_COVERAGE = 0.7;

    /** What an ingredient nobody recognised is assumed to add, for the stop-gap number. */
    private const UNKNOWN_INGREDIENT_KCAL = 90;

    private const MIN_KCAL = 30;

    private const MAX_KCAL = 3000;

    public function __construct(private OpenRouterClient $client) {}

    public function aiAvailable(): bool
    {
        return $this->client->available();
    }

    /**
     * Set calories / calories_source on the model from the algorithm alone (no save, no I/O).
     * Returns true when the number is only a stop-gap (`rough`) that the model should refine.
     */
    public function applyAlgorithm(Recipe $recipe): bool
    {
        $est = RecipeCalories::estimate($recipe->ingredients ?? []);
        if ($est['total'] === 0) {
            $recipe->calories = null;
            $recipe->calories_source = null;

            return false;
        }

        $coverage = $est['matched'] / $est['total'];
        $trusted = $coverage >= self::MIN_COVERAGE && $est['matched'] >= min(2, $est['total']) && $est['kcal'] >= self::MIN_KCAL;
        if ($trusted) {
            $recipe->calories = $this->clamp($est['kcal']);
            $recipe->calories_source = 'algorithm';

            return false;
        }

        $recipe->calories = $this->clamp($est['kcal'] + count($est['unmatched']) * self::UNKNOWN_INGREDIENT_KCAL);
        $recipe->calories_source = 'rough';

        return true;
    }

    /** Ask the model for one serving's calories and store it quietly (no observers). False if it could not. */
    public function refineWithAi(Recipe $recipe): bool
    {
        if (! $this->client->available()) {
            return false;
        }

        $kcal = $this->estimateWithAi($recipe);
        if ($kcal === null) {
            return false;
        }

        Recipe::whereKey($recipe->getKey())->update(['calories' => $kcal, 'calories_source' => 'ai']);
        $recipe->setRawAttributes(array_merge($recipe->getAttributes(), ['calories' => $kcal, 'calories_source' => 'ai']), true);

        return true;
    }

    private function estimateWithAi(Recipe $recipe): ?int
    {
        $ingredients = collect($recipe->ingredients ?? [])->pluck('name')->filter()->implode(', ');
        $steps = mb_substr(implode(' ', $recipe->steps ?? []), 0, 700);
        $prompt = <<<PROMPT
Estimate the calories in ONE typical adult serving of this recipe.

Recipe: "{$recipe->name}"
Ingredients (no quantities given): {$ingredients}
Method: {$steps}

Return ONLY a JSON object (no prose, no markdown fences) with exactly these fields:
- "servings": how many servings this recipe typically makes (integer, 1-12)
- "calories": kcal in ONE serving (integer, 30-3000)
PROMPT;

        try {
            $result = $this->client->complete([['role' => 'user', 'content' => $prompt]], 120);
            if (! ($result['ok'] ?? false)) {
                return null;
            }
            $content = trim(preg_replace('/^```(?:json)?|```$/m', '', trim((string) ($result['content'] ?? ''))) ?? '');
            $data = json_decode($content, true);
            if (! is_array($data) || ! isset($data['calories']) || ! is_numeric($data['calories'])) {
                return null;
            }

            return $this->clamp((float) $data['calories']);
        } catch (\Throwable $e) {
            Log::warning('Recipe calorie estimate failed', ['recipe' => $recipe->getKey(), 'error' => $e->getMessage()]);

            return null;
        }
    }

    private function clamp(float $kcal): int
    {
        return (int) max(self::MIN_KCAL, min(self::MAX_KCAL, round($kcal)));
    }
}
