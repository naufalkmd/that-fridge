<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * Computes a schedule-triggered Machine's next fire time from its trigger_config
 * ({frequency, time, weekday, timezone} - see Machine's docblock). Shared by
 * MachineController (first next_run_at on save/enable) and MachineRunner (advancing it after
 * a run), so the two can't drift into computing "next" differently.
 */
class MachineSchedule
{
    public static function nextRunAt(array $config, Carbon $after): Carbon
    {
        $timezone = $config['timezone'] ?? 'UTC';
        $local = $after->clone()->timezone($timezone);
        $candidate = $local->clone()->setTime((int) explode(':', $config['time'])[0], (int) explode(':', $config['time'])[1], 0);

        if (($config['frequency'] ?? null) === 'weekly') {
            $weekday = (int) $config['weekday'];
            while ($candidate->dayOfWeek !== $weekday || $candidate->lte($local)) {
                $candidate->addDay();
            }
        } elseif ($candidate->lte($local)) {
            $candidate->addDay();
        }

        return $candidate->timezone('UTC');
    }
}
