<?php

namespace App\Services\RecipeImport;

use App\Models\AdminSetting;
use Illuminate\Support\Carbon;

/**
 * The recipe import's schedule, set from Admin → Recipe import: on/off, the daily run time
 * (server time) and how many new recipes a run adds. Also keeps a summary of the last run.
 */
class RecipeImportSettings
{
    public const DEFAULT_TIME = '03:40';

    public const DEFAULT_LIMIT = 20;

    public const MAX_LIMIT = 100;

    public static function enabled(): bool
    {
        return (bool) AdminSetting::get('recipe_import.enabled', (bool) config('services.themealdb.enabled'));
    }

    /** "HH:MM", 24-hour, server time. */
    public static function time(): string
    {
        $t = (string) AdminSetting::get('recipe_import.time', self::DEFAULT_TIME);

        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t) ? $t : self::DEFAULT_TIME;
    }

    public static function limit(): int
    {
        return max(1, min(self::MAX_LIMIT, (int) AdminSetting::get('recipe_import.limit', self::DEFAULT_LIMIT)));
    }

    public static function save(bool $enabled, string $time, int $limit): void
    {
        AdminSetting::put('recipe_import.enabled', $enabled);
        AdminSetting::put('recipe_import.time', $time);
        AdminSetting::put('recipe_import.limit', max(1, min(self::MAX_LIMIT, $limit)));
    }

    /**
     * Whether the daily run is due this minute: switched on, it's the chosen time, and it hasn't
     * already run today (a manual run doesn't count, so it never skips the scheduled one).
     */
    public static function dueNow(?Carbon $now = null): bool
    {
        $now ??= now();
        if (! self::enabled() || $now->format('H:i') !== self::time()) {
            return false;
        }
        $last = self::lastRun();

        return ! ($last && ($last['trigger'] ?? null) === 'scheduled' && Carbon::parse($last['at'])->isSameDay($now));
    }

    /** @param  array{imported: int, exists: int, duplicate: int, low_quality: int, left?: int}  $tally */
    public static function recordRun(array $tally, string $trigger): void
    {
        AdminSetting::put('recipe_import.last_run', [...$tally, 'trigger' => $trigger, 'at' => now()->toIso8601String()]);
    }

    /** @return array{imported: int, exists: int, duplicate: int, low_quality: int, left?: int, trigger: string, at: string}|null */
    public static function lastRun(): ?array
    {
        $v = AdminSetting::get('recipe_import.last_run');

        return is_array($v) ? $v : null;
    }
}
