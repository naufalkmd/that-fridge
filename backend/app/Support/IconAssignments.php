<?php

namespace App\Support;

use App\Models\IconAssignment;
use Illuminate\Support\Facades\Cache;

/**
 * Admin-picked icons by food name, applied before the pack's keyword guess: for new items that
 * arrived without an icon, scans and barcode products. Kept in one cached map (small - one row
 * per name an admin has settled), flushed whenever an admin changes one.
 */
final class IconAssignments
{
    private const CACHE_KEY = 'icon-assignments:v1';

    /** @return array{icon: ?string, icon_url: ?string}|null */
    public static function forName(?string $name): ?array
    {
        $key = AlgoFeedback::nameKey($name);

        return $key === null ? null : (self::all()[$key] ?? null);
    }

    /** The icon key for a name: the admin's pick when it's a pack icon, else the pack's own guess. */
    public static function iconFor(string $name): ?string
    {
        return self::forName($name)['icon'] ?? FoodIconMatcher::guess($name);
    }

    /** @return array<string, array{icon: ?string, icon_url: ?string}> */
    public static function all(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => IconAssignment::query()
            ->get(['name_key', 'icon', 'icon_url'])
            ->mapWithKeys(fn ($a) => [$a->name_key => ['icon' => $a->icon, 'icon_url' => $a->icon_url]])
            ->all());
    }

    public static function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
