<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'style', 'photo_url', 'invite_code'])]
class Fridge extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sections(): HasMany
    {
        return $this->hasMany(Section::class);
    }

    public function notificationEvents(): HasMany
    {
        return $this->hasMany(NotificationEvent::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'fridge_members')->withPivot('role')->withTimestamps();
    }

    public function isMember(User $user): bool
    {
        return $this->members()->where('users.id', $user->id)->exists();
    }

    public function isOwner(User $user): bool
    {
        return $this->user_id === $user->id;
    }

    /**
     * Every fridge, however it's created (controller, tests, tinker), always gets its owner
     * as a 'owner'-role member row too - membership-based authorization otherwise locks the
     * owner out of their own fridge the instant it's created.
     */
    protected static function booted(): void
    {
        static::created(function (Fridge $fridge) {
            $fridge->members()->syncWithoutDetaching([$fridge->user_id => ['role' => 'owner']]);
        });
    }
}
