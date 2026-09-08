<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'kind',
    'credits',
    'prompt',
    'image_path',
    'image_url',
])]
class GeneratedIcon extends Model
{
    protected function casts(): array
    {
        return [
            'credits' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
