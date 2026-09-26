<?php

namespace App\Observers;

use App\Jobs\EstimateRecipeCalories;
use App\Models\Recipe;
use App\Services\MachineTriggerService;
use App\Services\RecipeCalorieService;
use Illuminate\Support\Facades\Auth;

/**
 * Fires recipe_made Machine triggers off made_count increasing - mirrors ItemObserver's
 * Auth::check() gate exactly: a live button-press or chat message is an authenticated
 * request, but a Machine's own mark_recipe_made step runs via a queued job with no web-request
 * Auth context, so gating here is what stops a Machine from re-triggering itself (or another
 * recipe_made Machine) through its own action.
 */
class RecipeObserver
{
    public function __construct(private MachineTriggerService $machines) {}

    /**
     * Calories per serving are always derived, never typed: computed from the ingredients whenever a
     * recipe is created, its ingredients change, or it has none yet. Only the fast, free table
     * algorithm runs in the request; a recipe it can't cover is handed to the model via a queued job.
     */
    public function saving(Recipe $recipe): void
    {
        if ($recipe->calories === null || $recipe->isDirty('ingredients')) {
            app(RecipeCalorieService::class)->applyAlgorithm($recipe);
        }
    }

    public function saved(Recipe $recipe): void
    {
        if ($recipe->calories_source === 'rough' && ($recipe->wasRecentlyCreated || $recipe->wasChanged('ingredients'))) {
            EstimateRecipeCalories::dispatch($recipe->id)->afterCommit();
        }
    }

    public function updated(Recipe $recipe): void
    {
        if (! Auth::check() || ! $recipe->wasChanged('made_count')) {
            return;
        }

        if ($recipe->made_count <= $recipe->getOriginal('made_count')) {
            return;
        }

        $this->machines->recipeMade($recipe, Auth::user());
    }
}
