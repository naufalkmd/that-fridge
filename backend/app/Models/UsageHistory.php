<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'key', 'name', 'icon', 'category', 'count', 'fresh_use_count', 'freshness_sum', 'freshness_sample_count', 'last_used_at'])]
class UsageHistory extends Model
{
    // The migration created a singular `usage_history` table, not Eloquent's default
    // pluralized guess (`usage_histories`) - same convention as ChatHistory.
    protected $table = 'usage_history';

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
