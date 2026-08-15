<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'section_id',
    'product_id',
    'name',
    'icon',
    'nutrition_category',
    'location',
    'quantity',
    'expiry_date',
    'shelf_life_days',
    'note',
    'source',
])]
class Item extends Model
{
    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
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
}
