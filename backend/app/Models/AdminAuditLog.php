<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Append-only trail of what admins did in the Filament panel. Written through record(),
 * never edited - the panel exposes it read-only.
 */
#[Fillable(['admin_id', 'admin_email', 'action', 'subject_type', 'subject_id', 'changes'])]
class AdminAuditLog extends Model
{
    protected function casts(): array
    {
        return [
            'changes' => 'array',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * Log one admin action against the signed-in admin. $subject may already be deleted (its
     * key and class are still readable), so this is safe to call after a delete.
     */
    public static function record(string $action, ?Model $subject = null, array $changes = []): self
    {
        $admin = Auth::user();

        return self::create([
            'admin_id' => $admin?->getKey(),
            'admin_email' => $admin?->email ?? 'system',
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'changes' => $changes ?: null,
        ]);
    }
}
