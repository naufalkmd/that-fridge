<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'minutes', 'category', 'icon', 'icon_url', 'ingredients', 'steps', 'attachments', 'meal_type', 'vibes', 'food_focus', 'made_count'])]
class Recipe extends Model
{
    protected function casts(): array
    {
        return [
            'ingredients' => 'array',
            'steps' => 'array',
            'attachments' => 'array',
            'vibes' => 'array',
            'food_focus' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function favoritedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'recipe_favorites')->withTimestamps();
    }

    /**
     * Every user's plan for this recipe - callers filter to the current user (see
     * RecipeController's eager loads), same pattern as favoritedBy above. Plural/unscoped
     * because a curated recipe is shared, so more than one user's plan can point at it.
     */
    public function consumptionPlans(): HasMany
    {
        return $this->hasMany(RecipeConsumptionPlan::class);
    }
}
