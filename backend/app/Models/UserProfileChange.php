<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per accepted name / username edit. Immutable - written once by
 * AuthController::updateProfile, never updated (hence no updated_at).
 */
#[Fillable(['user_id', 'field', 'old_value', 'new_value'])]
class UserProfileChange extends Model
{
    public const UPDATED_AT = null;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
