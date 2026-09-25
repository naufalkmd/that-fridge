<?php

namespace App\Support;

use App\Models\Item;
use Illuminate\Support\Carbon;

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

    /** The printed date and the saved opening estimate share one countdown. */
    public static function effectiveDaysUntilExpiry(Item $item): ?int
    {
        $date = self::effectiveExpiry($item);

        return $date ? (int) now()->startOfDay()->diffInDays($date, false) : null;
    }

    /** The printed date is always a hard ceiling on the opened-item estimate. */
    public static function effectiveExpiry(Item $item): ?Carbon
    {
        $printed = $item->expiry_date?->copy()->startOfDay();
        if (! $item->opened) {
            return $printed;
        }

        $override = $item->opened_shelf_life_source === 'user' ? $item->opened_shelf_life_days : null;
        $resolved = OpenedShelfLife::resolve(
            $item->name, $item->icon, $item->location, $item->nutrition_category,
            $item->shelf_life_days, $override,
        );
        if (! $resolved['openable']) {
            return $printed;
        }

        // Pre-snapshot opened rows are resolved exactly once, without triggering item
        // observers or moving an existing opening date.
        if ($item->opened_shelf_life_days === null || $item->opened_at === null) {
            $item->forceFill([
                'opened_shelf_life_days' => $item->opened_shelf_life_days ?? $resolved['days'],
                'opened_shelf_life_source' => $item->opened_shelf_life_source ?? $resolved['source'],
                'opened_at' => $item->opened_at ?? now(),
            ])->saveQuietly();
        }

        $cap = $item->opened_at->copy()->startOfDay()
            ->addDays($item->opened_shelf_life_days ?? $resolved['days']);

        return $printed === null || $cap->lessThan($printed) ? $cap : $printed;
    }
}
