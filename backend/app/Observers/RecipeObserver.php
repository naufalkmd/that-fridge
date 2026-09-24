<?php

namespace App\Observers;

use App\Models\Recipe;
use App\Services\MachineTriggerService;
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
