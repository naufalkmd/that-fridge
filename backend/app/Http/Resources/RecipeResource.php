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
            'icon' => $this->icon,
            'iconUrl' => $this->icon_url,
            'ingredients' => $this->ingredients,
            'steps' => $this->steps,
            'attachments' => $this->attachments ?? [],
            'mealType' => $this->meal_type,
            'vibes' => $this->vibes ?? [],
            'foodFocus' => $this->food_focus ?? [],
            'madeCount' => $this->made_count,
            'isCustom' => $this->user_id !== null,
            // Real ownership, distinct from isCustom (curated-vs-not) - a favorited recipe
            // belonging to someone else is isCustom: true but isMine: false, which is what
            // the frontend gates edit/delete on.
            'isMine' => $this->user_id === $request->user()->id,
            'ownerName' => $this->user_id !== null ? $this->user?->name : null,
            'ownerUsername' => $this->user_id !== null ? $this->user?->username : null,
            // index() eager-loads favoritedBy pre-filtered to the current user for efficiency;
            // store/update/favorite responses return a single recipe, so a lazy check here is
            // one cheap query rather than something worth eager-loading everywhere.
            'isFavorite' => $this->relationLoaded('favoritedBy')
                ? $this->favoritedBy->contains('id', $request->user()->id)
                : $this->favoritedBy()->where('users.id', $request->user()->id)->exists(),
            // Only ever set via an explicit, already-user-filtered eager load (see
            // RecipeController's index()/show()) - never lazy-loaded here, since an
            // unfiltered lazy load on this relation would leak another user's plan for a
            // shared curated recipe. AgentToolbox stores each entry's item_id in snake_case
            // (it writes plain tool args, not through a Resource) - map to camelCase here so
            // the wire format stays consistent with every other field on this resource.
            'consumptionPlan' => $this->whenLoaded('consumptionPlans', function () {
                $plan = $this->consumptionPlans->first()?->plan;

                return $plan === null ? null : collect($plan)->map(fn ($entry) => [
                    'ingredient' => $entry['ingredient'] ?? '',
                    'action' => $entry['action'] ?? 'skip',
                    'itemId' => isset($entry['item_id']) ? (string) $entry['item_id'] : null,
                    'amount' => $entry['amount'] ?? null,
                ])->all();
            }),
        ];
    }
}
