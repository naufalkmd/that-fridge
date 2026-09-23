<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Last-run record for the scheduled commands, shown on the admin dashboard. Written by the
 * scheduler's onSuccess/onFailure hooks (routes/console.php) and by the panel's "Run now"
 * buttons, so both paths show up.
 */
class JobHeartbeat
{
    /** Scheduled command => human label + expected cadence. */
    public const JOBS = [
        'app:check-item-freshness' => ['label' => 'Freshness check', 'every' => 'Daily 07:00'],
        'app:snapshot-kitchen-scores' => ['label' => 'Kitchen score snapshot', 'every' => 'Mondays 07:30'],
        'app:prune-stale-data' => ['label' => 'Prune stale data', 'every' => 'Daily 04:00'],
        'app:grant-monthly-credits' => ['label' => 'Monthly credit grant', 'every' => '1st of month 00:15'],
    ];

    public static function record(string $command, bool $ok): void
    {
        Cache::forever(self::key($command), ['ok' => $ok, 'at' => now()->toIso8601String()]);
    }

    /** @return array{ok: bool, at: string}|null */
    public static function last(string $command): ?array
    {
        return Cache::get(self::key($command));
    }

    private static function key(string $command): string
    {
        return "job-heartbeat:{$command}";
    }
}
