<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RecipeResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'minutes' => $this->minutes,
            'category' => $this->category,
            'ingredients' => $this->ingredients,
            'steps' => $this->steps,
            'attachments' => $this->attachments ?? [],
            'mealType' => $this->meal_type,
            'vibes' => $this->vibes ?? [],
            'foodFocus' => $this->food_focus ?? [],
            'madeCount' => $this->made_count,
            'isCustom' => $this->user_id !== null,
            // index() eager-loads favoritedBy pre-filtered to the current user for efficiency;
            // store/update/favorite responses return a single recipe, so a lazy check here is
            // one cheap query rather than something worth eager-loading everywhere.
            'isFavorite' => $this->relationLoaded('favoritedBy')
                ? $this->favoritedBy->contains('id', $request->user()->id)
                : $this->favoritedBy()->where('users.id', $request->user()->id)->exists(),
        ];
    }
}
