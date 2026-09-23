<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * plan is an array of {ingredient, action, item_id?, amount?} - one entry per ingredient line
 * on the recipe. action is one of:
 *   decrement   - reduce item_id's quantity by amount (whole units - not grams/ml)
 *   mark_opened - flag item_id as opened without changing its count
 *   use_up      - item_id is fully consumed (removed + logged, same as mark_item_used)
 *   skip        - nothing to track (water, salt, an ingredient not in inventory)
 * See AgentToolbox::setRecipeConsumptionPlan (writes it) and ::markRecipeMade (replays it).
 */
#[Fillable(['user_id', 'recipe_id', 'plan'])]
class RecipeConsumptionPlan extends Model
{
    protected function casts(): array
    {
        return [
            'plan' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(Recipe::class);
    }
}
