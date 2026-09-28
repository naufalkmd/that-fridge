<?php

namespace App\Jobs;

use App\Models\Recipe;
use App\Services\IconGenerationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Draw an AI icon for one recipe (Admin → Recipes: "Generate AI icon", the bulk action, or
 * "Generate missing icons"). Each takes 10-20 seconds, so they run on the queue, one at a time.
 * The food is described before drawing (FoodVisualDescriber), so dishes from any cuisine come out
 * as themselves. Saved under QUEUED_FOLDER: the worker runs as `deploy`, which can't write into
 * the "icons/" folder the web server (www-data) created.
 */
class GenerateRecipeIcon implements ShouldQueue
{
    use Queueable;

    public int $timeout = 120;

    public int $tries = 1;

    /** Created by scripts/deploy.sh as the deploy user, so the worker can always write here. */
    public const QUEUED_FOLDER = 'queued-icons';

    /** @param  bool  $replace  false = skip a recipe that got an AI icon in the meantime */
    public function __construct(public int $recipeId, public int $adminId, public bool $replace = false) {}

    public function handle(IconGenerationService $icons): void
    {
        $recipe = Recipe::find($this->recipeId);
        if (! $recipe || (! $this->replace && $recipe->icon_url)) {
            return;
        }

        $result = $icons->generateIcon($recipe->name, $this->adminId, 'recipe', self::QUEUED_FOLDER);
        if (! $result['ok']) {
            Log::warning('Recipe icon generation failed', ['recipe_id' => $recipe->id, 'reason' => $result['reason'] ?? null]);

            return;
        }
        $recipe->update(['icon_url' => $result['image_url']]);
    }
}
