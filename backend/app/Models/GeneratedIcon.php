<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

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

    /** Its copy in the shared pack, if curated. At most one - unique on source_generated_icon_id. */
    public function sharedIcon(): HasOne
    {
        return $this->hasOne(SharedIcon::class, 'source_generated_icon_id');
    }
}
