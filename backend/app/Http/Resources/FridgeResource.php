<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FridgeResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // `members` is expected to be eager-loaded pre-filtered to just the requesting user
        // (see FridgeController) so this is a 0-or-1-row lookup, not every member's row.
        $currentMembership = $this->whenLoaded('members') !== null ? $this->members->first() : null;

        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'style' => $this->style,
            'photo_url' => $this->photo_url,
            'invite_code' => $this->invite_code,
            'role' => $currentMembership?->pivot->role,
            'member_count' => $this->when($this->members_count !== null, $this->members_count),
            'sections' => SectionResource::collection($this->whenLoaded('sections')),
        ];
    }
}
