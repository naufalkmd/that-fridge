<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'fridge_id', 'date', 'slot', 'time', 'recipe_id', 'title', 'note', 'calories', 'calories_source', 'status', 'cooked_at'])]
class MealEntry extends Model
{
    public const STATUSES = ['planned', 'cooked', 'skipped'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'cooked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(Recipe::class);
    }

    /**
     * What a viewer may see: their own entries, plus entries on a fridge they belong to whose
     * OWNER is Pro (evaluated now, so nothing is deleted when Pro lapses - visibility narrows).
     * Mirrors MealEntryPolicy::sharedWith; both read User::scopePro / isPro.
     */
    public function scopeVisibleTo(Builder $query, User $viewer): Builder
    {
        return $query->where(function (Builder $q) use ($viewer) {
            $q->where('user_id', $viewer->id)->orWhereIn('fridge_id', self::sharedFridgeIds($viewer));
        });
    }

    /** @return Builder<Fridge> ids of fridges the viewer belongs to that a Pro user owns */
    public static function sharedFridgeIds(User $viewer): Builder
    {
        return Fridge::query()
            ->whereHas('members', fn ($m) => $m->where('users.id', $viewer->id))
            ->whereHas('user', fn ($owner) => $owner->pro())
            ->select('fridges.id');
    }
}
