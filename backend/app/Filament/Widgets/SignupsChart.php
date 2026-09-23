<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class SignupsChart extends ChartWidget
{
    protected static ?string $heading = 'Signups per day (last 30 days)';

    protected static ?int $sort = 2;

    protected function getData(): array
    {
        $d = Cache::remember('admin:signups:30', now()->addMinutes(5), fn () => app(AdminStats::class)->signupsByDay(30));

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
