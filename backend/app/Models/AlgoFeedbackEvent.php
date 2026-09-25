<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'algo', 'kind', 'rules_v', 'name_key', 'class', 'guess', 'final', 'guess_number', 'final_number', 'source', 'confidence', 'outcome', 'occurred_at'])]
class AlgoFeedbackEvent extends Model
{
    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'guess_number' => 'decimal:3',
            'final_number' => 'decimal:3',
            'confidence' => 'decimal:3',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
