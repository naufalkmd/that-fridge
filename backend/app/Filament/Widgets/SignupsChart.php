<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Support\RawJs;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

/** New accounts per day, stacked by how they signed in. Whole-number axis: signups are counts, so there is no "1.5 people". */
class SignupsChart extends ChartWidget
{
    protected static ?string $heading = 'New signups per day';

    protected static ?int $sort = 2;

    // Numbers are cached for minutes anyway; Filament's default 5s polling would just
    // re-request the same cached payload every 5 seconds per open tab.
    protected static ?string $pollingInterval = null;

    protected static ?string $maxHeight = '260px';

    public function getDescription(): ?string
    {
        return 'Last 30 days, by how people signed in.';
    }

    protected function getData(): array
    {
        $d = Cache::flexible(AdminCacheKeys::SIGNUPS, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->signupsByDay(30));

        return [
            'datasets' => [
                ['label' => 'Apple', 'data' => $d['apple'], 'backgroundColor' => '#6b7280', 'borderRadius' => 3],
                ['label' => 'Google', 'data' => $d['google'], 'backgroundColor' => '#3b82f6', 'borderRadius' => 3],
                ['label' => 'Email', 'data' => $d['email'], 'backgroundColor' => '#f59e0b', 'borderRadius' => 3],
            ],
            'labels' => $d['labels'],
        ];
    }

    protected function getType(): string
    {
        return 'bar';
    }

    protected function getOptions(): array|RawJs|null
    {
        return RawJs::make(<<<'JS'
        {
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                y: { stacked: true, beginAtZero: true, ticks: { precision: 0, stepSize: 1 } },
            },
        }
        JS);
    }
}
