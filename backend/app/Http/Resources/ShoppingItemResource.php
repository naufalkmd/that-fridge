<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShoppingItemResource extends JsonResource
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
            'name' => $this->name,
            'icon' => $this->icon,
            'section' => $this->section,
            'checked' => $this->checked,
            'shopUrl' => $this->shop_url,
        ];
    }
}
