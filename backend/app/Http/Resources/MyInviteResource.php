<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MyInviteResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * The inverse of FridgeJoinRequestResource: that one describes the invited person (for the
     * owner's JOIN REQUESTS list), this one describes the fridge + inviter (for the invited
     * person's own MY INVITES list) - $this is a pending, owner-initiated FridgeJoinRequest.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'fridgeId' => (string) $this->fridge_id,
            'fridgeName' => $this->fridge->name,
            'inviterName' => $this->fridge->user->name,
            'inviterUsername' => $this->fridge->user->username,
            'createdAt' => $this->created_at->getTimestamp() * 1000,
        ];
    }
}
