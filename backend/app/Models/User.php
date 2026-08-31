<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'username', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function fridges(): HasMany
    {
        return $this->hasMany(Fridge::class);
    }

    /**
     * Fridges this user can access - owned or joined by having a join request approved. This
     * is the relation every inventory/scoring query should scope by; fridges() above stays
     * "fridges I own" and is only used where ownership specifically matters (deleting a
     * fridge, managing its members).
     */
    public function memberFridges(): BelongsToMany
    {
        return $this->belongsToMany(Fridge::class, 'fridge_members')->withPivot('role')->withTimestamps();
    }

    /**
     * Join requests this user has sent (any status) - "you're already a member" and
     * "you've already requested" checks read from here (see FridgeJoinRequestController).
     */
    public function sentJoinRequests(): HasMany
    {
        return $this->hasMany(FridgeJoinRequest::class, 'requester_id');
    }

    public function shoppingItems(): HasMany
    {
        return $this->hasMany(ShoppingItem::class);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }

    public function notificationPref(): HasOne
    {
        return $this->hasOne(NotificationPref::class);
    }

    public function pushTokens(): HasMany
    {
        return $this->hasMany(PushToken::class);
    }

    public function goal(): HasOne
    {
        return $this->hasOne(UserGoal::class);
    }

    public function organizerTally(): HasOne
    {
        return $this->hasOne(OrganizerTally::class);
    }

    public function chatHistory(): HasMany
    {
        return $this->hasMany(ChatHistory::class);
    }

    public function usageHistory(): HasMany
    {
        return $this->hasMany(UsageHistory::class);
    }

    public function userMemory(): HasOne
    {
        return $this->hasOne(UserMemory::class);
    }

    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class);
    }

    public function favoriteRecipes(): BelongsToMany
    {
        return $this->belongsToMany(Recipe::class, 'recipe_favorites')->withTimestamps();
    }

    public function weeklyScoreSnapshots(): HasMany
    {
        return $this->hasMany(WeeklyScoreSnapshot::class);
    }

    public function badges(): HasMany
    {
        return $this->hasMany(UserBadge::class);
    }
}
