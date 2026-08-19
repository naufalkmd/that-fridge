<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MyRequestResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * The cross-fridge counterpart to MyInviteResource: that one describes an invite sent TO
     * the current user, this one describes a request sent to a fridge THEY own - $this is a
     * pending, requester-initiated FridgeJoinRequest.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'fridgeId' => (string) $this->fridge_id,
            'fridgeName' => $this->fridge->name,
            'requesterName' => $this->requester->name,
            'requesterUsername' => $this->requester->username,
            'createdAt' => $this->created_at->getTimestamp() * 1000,
        ];
    }
}
