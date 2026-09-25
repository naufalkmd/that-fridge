<?php

namespace App\Http\Resources;

use App\Support\ItemFreshness;
use App\Support\OpenedShelfLife;
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
        $days = ItemFreshness::effectiveDaysUntilExpiry($this->resource);
        $opening = OpenedShelfLife::resolve(
            $this->name, $this->icon, $this->location, $this->nutrition_category,
            $this->shelf_life_days,
            $this->opened_shelf_life_source === 'user' ? $this->opened_shelf_life_days : null,
        );

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
            'added' => $this->created_at?->toISOString(),
            'opened' => (bool) $this->opened && $opening['openable'],
            'openable' => $opening['openable'],
            'opened_shelf_life_days' => $this->opened_shelf_life_days,
            'opened_shelf_life_source' => $this->opened_shelf_life_source,
            'note' => $this->note,
            'location' => $this->location,
            'quantity' => $this->quantity,
            'weight' => $this->weight,
            'weight_unit' => $this->weight_unit,
            'shop_url' => $this->shop_url,
            'calories' => $this->calories,
            'custom_fields' => $this->custom_fields ?? [],
        ];
    }
}
