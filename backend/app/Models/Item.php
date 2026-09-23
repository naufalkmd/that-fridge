<?php

namespace App\Models;

use App\Observers\ItemObserver;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy([ItemObserver::class])]
#[Fillable([
    'section_id',
    'product_id',
    'category_id',
    'name',
    'icon',
    'icon_url',
    'nutrition_category',
    'location',
    'quantity',
    'weight',
    'weight_unit',
    'expiry_date',
    'shelf_life_days',
    'opened',
    'note',
    'source',
    'shop_url',
    'calories',
    'custom_fields',
])]
/**
 * custom_fields: [{"id": string uuid, "label": string, "value": string}, ...] - user-defined
 * key/value rows shown on the item-detail screen, alongside the fixed fields. Whole array is
 * replaced on every PATCH (see ItemController::normalizeItemPayload()); ids are server-assigned
 * on first write and stable thereafter so a specific row can be edited/deleted by id.
 */
class Item extends Model
{
    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
            'opened' => 'boolean',
            'opened_at' => 'datetime',
            'weight' => 'float',
            'custom_fields' => 'array',
        ];
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
