<?php

namespace App\Support;

use App\Models\Item;

/**
 * Same computation as ItemResource's `days` field - shared so KitchenScoreService and
 * RecipeController::suggest (the "use it up" vibe's expiring-overlap score) don't each carry
 * their own copy of this date math.
 */
class ItemFreshness
{
    /** Null when the item has no expiry_date set - callers decide how to treat "unknown". */
    public static function daysUntilExpiry(Item $item): ?int
    {
        if (! $item->expiry_date) {
            return null;
        }

        return (int) now()->startOfDay()->diffInDays($item->expiry_date->copy()->startOfDay(), false);
    }
}
