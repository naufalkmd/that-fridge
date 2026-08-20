<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'prompt',
    'image_path',
    'image_url',
])]
class GeneratedIcon extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
