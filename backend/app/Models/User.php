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

#[Fillable(['name', 'username', 'email', 'password', 'oauth_provider', 'oauth_sub', 'data_transfer_consented_at', 'preferences'])]
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
            'data_transfer_consented_at' => 'datetime',
            'pro_expires_at' => 'datetime',
            'preferences' => 'array',
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

    /** Users this user has blocked. */
    public function blocking(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'blocks', 'blocker_id', 'blocked_id')->withTimestamps();
    }

    /** Users who have blocked this user. */
    public function blockedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'blocks', 'blocked_id', 'blocker_id')->withTimestamps();
    }

    /**
     * True if either user has blocked the other - the check every user-to-user contact point
     * (search, join requests, invites) gates on, since a block should stop contact both ways
     * regardless of who initiated it.
     */
    public function blockedEitherWayWith(User $other): bool
    {
        return $this->blocking()->where('users.id', $other->id)->exists()
            || $this->blockedBy()->where('users.id', $other->id)->exists();
    }

    /**
     * Synced from RevenueCat webhooks (RevenueCatWebhookController) - never set directly from
     * a user-facing request, so `pro_expires_at` is deliberately not in #[Fillable] above.
     */
    public function isPro(): bool
    {
        return $this->pro_expires_at !== null && $this->pro_expires_at->isFuture();
    }

    /**
     * The free tier gets one fridge slot of each kind: one fridge you own, plus one shared
     * fridge you've joined. Pro lifts both caps. They're separate because "I keep my own
     * fridge AND join my partner's" is the ordinary household case and shouldn't cost
     * anything - the old single "one fridge total" rule forced anyone who'd finished
     * onboarding (everyone gets an auto-created fridge) to delete theirs before they could
     * join a shared one, which made the shared-fridge feature unusable for free users.
     *
     * Owner vs joined is read from the fridge_members `role` pivot ('owner' on your own
     * fridge - set in Fridge::booted() - vs 'member' on one you joined via
     * FridgeJoinRequestController::attachMember). isPro() tracks `pro_expires_at`, synced
     * from RevenueCat by RevenueCatWebhookController.
     */
    public function canOwnAnotherFridge(): bool
    {
        return $this->isPro() || $this->fridges()->count() < 1;
    }

    public function canJoinAnotherSharedFridge(): bool
    {
        return $this->isPro()
            || $this->memberFridges()->wherePivot('role', 'member')->count() < 1;
    }
}
