<?php

namespace App\Jobs;

use App\Models\Recipe;
use App\Services\RecipeCalorieService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Hands a recipe the nutrition table could not cover to the model, off the request that saved it.
 * Only refines a stop-gap ("rough") number, so a recipe re-saved meanwhile is never overwritten.
 */
class EstimateRecipeCalories implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public int $recipeId) {}

    public function handle(RecipeCalorieService $calories): void
    {
        $recipe = Recipe::find($this->recipeId);
        if ($recipe && $recipe->calories_source === 'rough') {
            $calories->refineWithAi($recipe);
        }
    }
}
