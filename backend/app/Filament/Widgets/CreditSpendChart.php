<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

class CreditSpendChart extends ChartWidget
{
    protected static ?string $heading = 'AI credits spent by feature (last 7 days)';

    protected static ?int $sort = 3;

    protected function getData(): array
    {
        $byReason = Cache::remember('admin:credit-spend:7', now()->addMinutes(5), fn () => app(AdminStats::class)->creditSpendByReason(7));

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
