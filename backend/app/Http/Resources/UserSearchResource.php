<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserSearchResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * Deliberately no email - unlike FridgeMemberResource (which shows it because that's
     * gated by actual membership), this is reachable by any authenticated user searching for
     * anyone else.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'username' => $this->username,
        ];
    }
}
