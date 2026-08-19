<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FridgeJoinRequestResource extends JsonResource
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
            'fridgeId' => (string) $this->fridge_id,
            'requesterId' => (string) $this->requester_id,
            'requesterName' => $this->requester->name,
            'requesterUsername' => $this->requester->username,
            'status' => $this->status,
            'createdAt' => $this->created_at->getTimestamp() * 1000,
        ];
    }
}
