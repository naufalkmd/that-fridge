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

        // An opened item goes bad sooner — cap its effective days so freshness/urgency reflect
        // "already started", matching the web's markItemOpened behaviour.
        if ($this->opened && $days !== null) {
            $days = min($days, 3);
        }

        $freshness = null;
        if ($days !== null && $shelfLifeDays) {
            $freshness = (int) max(0, min(100, round(($days / $shelfLifeDays) * 100)));
        }

        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'icon' => $this->icon,
            'icon_url' => $this->icon_url,
            'nutrition_category' => $this->nutrition_category,
            'category_id' => $this->category_id ? (string) $this->category_id : null,
            'freshness' => $freshness,
            'days' => $days,
            'opened' => (bool) $this->opened,
            'note' => $this->note,
            'location' => $this->location,
            'quantity' => $this->quantity,
            'shop_url' => $this->shop_url,
        ];
    }
}
