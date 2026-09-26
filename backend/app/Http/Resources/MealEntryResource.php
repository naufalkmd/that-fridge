<?php

namespace App\Http\Resources;

use App\Models\MealEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MealEntry */
class MealEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'date' => $this->date->toDateString(),
            'slot' => $this->slot,
            'time' => $this->time,
            'title' => $this->title,
            'note' => $this->note,
            'calories' => $this->calories,
            'caloriesSource' => $this->calories_source,
            'status' => $this->status,
            'recipeId' => $this->recipe_id !== null ? (string) $this->recipe_id : null,
            'fridgeId' => $this->fridge_id !== null ? (string) $this->fridge_id : null,
            'cookedAt' => $this->cooked_at?->toIso8601String(),
            // Attribution only when someone else made it - the sole visible cue of a shared plan.
            'by' => $this->user_id !== $request->user()->id ? $this->user?->username : null,
            'isMine' => $this->user_id === $request->user()->id,
        ];
    }
}
