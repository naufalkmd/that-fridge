<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ItemResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $shelfLifeDays = $this->shelf_life_days ?? $this->product?->default_shelf_life_days;
        $days = $this->expiry_date
            ? (int) now()->startOfDay()->diffInDays($this->expiry_date->copy()->startOfDay(), false)
            : null;

        $freshness = null;
        if ($days !== null && $shelfLifeDays) {
            $freshness = (int) max(0, min(100, round(($days / $shelfLifeDays) * 100)));
        }

        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'icon' => $this->icon,
            'nutrition_category' => $this->nutrition_category,
            'freshness' => $freshness,
            'days' => $days,
            'note' => $this->note,
            'location' => $this->location,
            'quantity' => $this->quantity,
            'shop_url' => $this->shop_url,
        ];
    }
}
