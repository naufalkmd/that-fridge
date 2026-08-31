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
    'expiry_date',
    'shelf_life_days',
    'opened',
    'note',
    'source',
    'shop_url',
])]
class Item extends Model
{
    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
            'opened' => 'boolean',
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
