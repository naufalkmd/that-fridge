<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One entry in the Explore catalogue (see the create_explore_items migration). `ref_id` points at a
 * Recipe or SharedIcon; Machine and meal-plan entries carry their content in `payload`.
 */
#[Fillable(['type', 'ref_id', 'payload', 'title', 'blurb', 'tags', 'featured', 'position', 'status'])]
class ExploreItem extends Model
{
    public const TYPES = ['icon', 'recipe', 'machine', 'meal_plan'];

    public const STATUSES = ['draft', 'published', 'hidden'];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'tags' => 'array',
            'featured' => 'boolean',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', 'published');
    }
}
