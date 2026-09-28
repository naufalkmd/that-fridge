<?php

namespace App\Models;

use App\Observers\RecipeObserver;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[ObservedBy([RecipeObserver::class])]
#[Fillable(['user_id', 'external_id', 'source_url', 'source_name', 'author', 'name', 'minutes', 'category', 'icon', 'icon_url', 'ingredients', 'steps', 'attachments', 'meal_type', 'vibes', 'food_focus', 'made_count'])]
class Recipe extends Model
{
    protected function casts(): array
    {
        return [
            'ingredients' => 'array',
            'steps' => 'array',
            'attachments' => 'array',
            'vibes' => 'array',
            'food_focus' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function favoritedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'recipe_favorites')->withTimestamps();
    }

    /** This recipe's entries in the Explore catalogue. */
    public function exploreItems(): HasMany
    {
        return $this->hasMany(ExploreItem::class, 'ref_id')->where('type', 'recipe');
    }

    /**
     * Curated recipes the crew may draw on (suggestions, chat, meal plans): everything without an
     * owner except what Explore is holding back - an import still waiting for approval (draft) or
     * one an admin hid. They live in Explore; a user's own book is just their recipes + favourites.
     */
    public function scopeLibrary(Builder $query): Builder
    {
        return $query->whereNull('user_id')
            ->whereDoesntHave('exploreItems', fn ($q) => $q->whereIn('status', ['draft', 'hidden']));
    }

    /** The user's own recipes plus the curated library. */
    public function scopeUsableBy(Builder $query, User $user): Builder
    {
        return $query->where(fn ($q) => $q->where('user_id', $user->id)
            ->orWhere(fn ($c) => $c->library()));
    }
}
