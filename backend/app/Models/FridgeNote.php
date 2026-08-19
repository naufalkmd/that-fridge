<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['fridge_id', 'user_id', 'text', 'color'])]
class FridgeNote extends Model
{
    public const COLORS = ['amber', 'blue', 'good', 'warn', 'bad'];

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
