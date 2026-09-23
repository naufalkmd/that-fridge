<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class CreditSpendChart extends ChartWidget
{
    protected static ?string $heading = 'AI credits spent by feature (last 7 days)';

    protected static ?int $sort = 3;

    // Numbers are cached for minutes anyway; Filament's default 5s polling would just
    // re-request the same cached payload every 5 seconds per open tab.
    protected static ?string $pollingInterval = null;

    protected function getData(): array
    {
        $byReason = Cache::flexible(AdminCacheKeys::CREDIT_SPEND, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->creditSpendByReason(7));

        return [
            'datasets' => [
                ['label' => 'Credits', 'data' => array_values($byReason), 'backgroundColor' => '#f59e0b'],
            ],
            'labels' => array_keys($byReason),
        ];
    }

    protected function getType(): string
    {
        return 'bar';
    }
}
