<?php

namespace App\Support;

use App\Jobs\GenerateRecipeIcon;
use App\Models\Recipe;
use Illuminate\Database\Eloquent\Builder;

/** Admin helpers for giving recipes AI icons in bulk. */
final class RecipeIconGeneration
{
    /** Roughly what one icon costs: fal.ai image + background removal, plus the short description. */
    public const COST_USD = 0.004;

    /** Most icons one click queues. */
    public const MAX_BATCH = 100;

    /**
     * Curated recipes with no icon of their own: no AI icon and no pack icon picked - what the
     * recipe import brings in. (They still show their first ingredient's icon in the app.)
     *
     * @return Builder<Recipe>
     */
    public static function missing(): Builder
    {
        return Recipe::query()
            ->whereNull('user_id')
            ->whereNull('icon_url')
            ->where(fn ($q) => $q->whereNull('icon')->orWhereIn('icon', ['', 'generic']));
    }

    /** @param  iterable<int>  $recipeIds */
    public static function queue(iterable $recipeIds, int $adminId, bool $replace): int
    {
        $n = 0;
        foreach ($recipeIds as $id) {
            GenerateRecipeIcon::dispatch((int) $id, $adminId, $replace);
            $n++;
        }

        return $n;
    }
}
