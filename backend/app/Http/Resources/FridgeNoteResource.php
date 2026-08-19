<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FridgeNoteResource extends JsonResource
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
            'fridgeName' => $this->fridge->name,
            'text' => $this->text,
            'color' => $this->color,
            // The author can be null (see FridgeNote's nullOnDelete) if their account no longer
            // exists - the note itself still stands, just anonymized.
            'authorName' => $this->user?->name,
            'authorUsername' => $this->user?->username,
            'createdAt' => $this->created_at->getTimestamp() * 1000,
            'updatedAt' => $this->updated_at->getTimestamp() * 1000,
        ];
    }
}
