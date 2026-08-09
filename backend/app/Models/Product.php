<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['barcode', 'name', 'icon', 'category', 'default_shelf_life_days', 'location', 'image_url'])]
class Product extends Model
{
    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }
}
