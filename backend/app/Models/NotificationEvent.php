<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['fridge_id', 'user_id', 'item_id', 'kind', 'message', 'done'])]
class NotificationEvent extends Model
{
    protected function casts(): array
    {
        return [
            'done' => 'boolean',
        ];
    }

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
