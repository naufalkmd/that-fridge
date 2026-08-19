<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FridgeMemberResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * $this is a User loaded through Fridge::members(), so pivot columns (role,
     * created_at) come from the fridge_members row, not the users table.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->pivot->role,
            'joinedAt' => $this->pivot->created_at?->getTimestamp() * 1000,
        ];
    }
}
