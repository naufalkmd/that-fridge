<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('app:check-item-freshness')->dailyAt('07:00');
Schedule::command('app:snapshot-kitchen-scores')->weeklyOn(1, '07:30');
