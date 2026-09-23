<?php

namespace Tests\Unit;

use App\Support\MachineSchedule;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

/**
 * Pure date math with no database/container dependency - extends the framework TestCase
 * directly rather than Tests\TestCase.
 */
class MachineScheduleTest extends TestCase
{
    public function test_daily_schedule_picks_todays_time_when_still_ahead(): void
    {
        $after = Carbon::parse('2026-09-24 06:00:00', 'UTC');
        $config = ['frequency' => 'daily', 'time' => '08:00', 'timezone' => 'UTC'];

        $next = MachineSchedule::nextRunAt($config, $after);

        $this->assertSame('2026-09-24 08:00:00', $next->toDateTimeString());
    }

    public function test_daily_schedule_rolls_to_tomorrow_once_todays_time_has_passed(): void
    {
        $after = Carbon::parse('2026-09-24 09:00:00', 'UTC');
        $config = ['frequency' => 'daily', 'time' => '08:00', 'timezone' => 'UTC'];

        $next = MachineSchedule::nextRunAt($config, $after);

        $this->assertSame('2026-09-25 08:00:00', $next->toDateTimeString());
    }

    public function test_weekly_schedule_lands_on_the_configured_weekday(): void
    {
        // 2026-09-24 is a Thursday (weekday 4); ask for Monday (1).
        $after = Carbon::parse('2026-09-24 06:00:00', 'UTC');
        $config = ['frequency' => 'weekly', 'time' => '08:00', 'weekday' => 1, 'timezone' => 'UTC'];

        $next = MachineSchedule::nextRunAt($config, $after);

        $this->assertSame('2026-09-28 08:00:00', $next->toDateTimeString());
        $this->assertSame(1, $next->dayOfWeek);
    }

    public function test_weekly_schedule_waits_a_full_week_when_today_is_already_the_target_day_but_past_time(): void
    {
        // 2026-09-24 is a Thursday (weekday 4).
        $after = Carbon::parse('2026-09-24 09:00:00', 'UTC');
        $config = ['frequency' => 'weekly', 'time' => '08:00', 'weekday' => 4, 'timezone' => 'UTC'];

        $next = MachineSchedule::nextRunAt($config, $after);

        $this->assertSame('2026-10-01 08:00:00', $next->toDateTimeString());
    }

    public function test_converts_a_non_utc_timezone_back_to_utc(): void
    {
        // 08:00 in Asia/Jakarta (UTC+7) is 01:00 UTC.
        $after = Carbon::parse('2026-09-24 00:00:00', 'UTC');
        $config = ['frequency' => 'daily', 'time' => '08:00', 'timezone' => 'Asia/Jakarta'];

        $next = MachineSchedule::nextRunAt($config, $after);

        $this->assertSame('UTC', $next->timezoneName);
        $this->assertSame('2026-09-24 01:00:00', $next->toDateTimeString());
    }
}
