<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'original_item_id', 'name_key', 'outcome', 'corrected_from', 'confidence', 'context', 'predicted_days', 'actual_days', 'snapshot', 'usage_delta', 'badge_counted', 'undone_at'])]
class ItemOutcome extends Model
{
    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'usage_delta' => 'array',
            'badge_counted' => 'boolean',
            'undone_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
