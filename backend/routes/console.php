<?php

use App\Support\JobHeartbeat;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

$heartbeat = fn ($event, string $command) => $event
    ->onSuccess(fn () => JobHeartbeat::record($command, true))
    ->onFailure(fn () => JobHeartbeat::record($command, false));

$heartbeat(Schedule::command('app:check-item-freshness')->dailyAt('07:00'), 'app:check-item-freshness');
$heartbeat(Schedule::command('app:snapshot-kitchen-scores')->weeklyOn(1, '07:30'), 'app:snapshot-kitchen-scores');
$heartbeat(Schedule::command('app:prune-stale-data')->dailyAt('04:00'), 'app:prune-stale-data');
$heartbeat(Schedule::command('app:rollup-algo-stats')->dailyAt('04:30'), 'app:rollup-algo-stats');
$heartbeat(Schedule::command('app:fill-recipe-calories', ['--limit' => 50])->dailyAt('05:00'), 'app:fill-recipe-calories');
$heartbeat(Schedule::command('app:grant-monthly-credits')->monthlyOn(1, '00:15'), 'app:grant-monthly-credits');
$heartbeat(Schedule::command('app:run-due-machines')->everyFiveMinutes(), 'app:run-due-machines');
