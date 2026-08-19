<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrganizerTallyResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'itemsCheckedTotal' => $this->items_checked_total,
            'itemsCorrectTotal' => $this->items_correct_total,
            'lastCheckedAt' => $this->last_checked_at ? $this->last_checked_at->getTimestamp() * 1000 : null,
        ];
    }
}
