<?php

namespace App\Http\Resources;

use App\Models\ExploreItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ExploreItem
 *
 * The related row (`recipe` / `icon`) is attached by ExploreController in one query per type, so this
 * never runs a query per item.
 */
class ExploreItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $recipe = $this->resource->getRelation('recipe');
        $icon = $this->resource->getRelation('icon');

        return [
            'id' => (string) $this->id,
            'type' => $this->type,
            'title' => $this->title,
            'blurb' => $this->blurb,
            'tags' => $this->tags ?? [],
            'featured' => $this->featured,
            'imageUrl' => $icon?->image_url,
            'recipe' => $recipe ? [
                'minutes' => $recipe->minutes,
                'calories' => $recipe->calories,
                'mealType' => $recipe->meal_type,
                'icon' => $recipe->icon,
                'iconUrl' => $recipe->icon_url,
                'ingredients' => count($recipe->ingredients ?? []),
            ] : null,
            // Machines: the draft (name, trigger, steps). Meal plans: the list of {day, slot, title}.
            'payload' => in_array($this->type, ['machine', 'meal_plan'], true) ? $this->payload : null,
        ];
    }
}
