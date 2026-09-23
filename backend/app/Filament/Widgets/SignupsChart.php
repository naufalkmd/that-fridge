<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class SignupsChart extends ChartWidget
{
    protected static ?string $heading = 'Signups per day (last 30 days)';

    protected static ?int $sort = 2;

    // Numbers are cached for minutes anyway; Filament's default 5s polling would just
    // re-request the same cached payload every 5 seconds per open tab.
    protected static ?string $pollingInterval = null;

    protected function getData(): array
    {
        $d = Cache::flexible(AdminCacheKeys::SIGNUPS, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->signupsByDay(30));

        return [
            'datasets' => [
                ['label' => 'Apple', 'data' => $d['apple'], 'borderColor' => '#6b7280', 'backgroundColor' => '#6b7280'],
                ['label' => 'Google', 'data' => $d['google'], 'borderColor' => '#3b82f6', 'backgroundColor' => '#3b82f6'],
                ['label' => 'Email', 'data' => $d['email'], 'borderColor' => '#f59e0b', 'backgroundColor' => '#f59e0b'],
            ],
            'labels' => $d['labels'],
        ];
    }

    protected function getType(): string
    {
        return 'line';
    }
}
