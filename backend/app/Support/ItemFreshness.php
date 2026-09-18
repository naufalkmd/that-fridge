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

    /**
     * Same as daysUntilExpiry(), but capped for an opened item - "opened" items are treated as
     * going bad within 3 days of being opened. The cap counts down from opened_at (3, 2, 1, 0,
     * expired) rather than pinning at a flat 3 on every call, so an item with a long shelf life
     * left doesn't freeze on the same number for weeks. A missing opened_at (item opened before
     * that column existed) falls back to "just opened".
     */
    public static function effectiveDaysUntilExpiry(Item $item): ?int
    {
        $days = self::daysUntilExpiry($item);

        if (! $item->opened || $days === null) {
            return $days;
        }

        $daysSinceOpened = $item->opened_at
            ? $item->opened_at->copy()->startOfDay()->diffInDays(now()->startOfDay(), false)
            : 0;

        return min($days, 3 - $daysSinceOpened);
    }
}
