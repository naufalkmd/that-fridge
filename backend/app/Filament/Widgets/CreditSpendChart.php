<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use App\Support\CreditReasonLabels;
use Filament\Support\RawJs;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

/** What users spent their AI credits on, biggest first, under plain feature names. (What this costs US is the AI charts above.) */
class CreditSpendChart extends ChartWidget
{
    protected static ?string $heading = 'What users spend AI credits on';

    protected static ?int $sort = 6;

    // Numbers are cached for minutes anyway; Filament's default 5s polling would just
    // re-request the same cached payload every 5 seconds per open tab.
    protected static ?string $pollingInterval = null;

    protected static ?string $maxHeight = '300px';

    public ?string $filter = '7';

    public function getDescription(): ?string
    {
        return 'Credits users spent per feature, biggest first.';
    }

    protected function getFilters(): ?array
    {
        return ['7' => 'Last 7 days', '30' => 'Last 30 days'];
    }

    protected function getData(): array
    {
        $days = (int) ($this->filter ?: 7);
        $key = $days === 7 ? AdminCacheKeys::CREDIT_SPEND : "admin:credit-spend:{$days}";
        $byReason = Cache::flexible($key, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->creditSpendByReason($days));

        return [
            'datasets' => [
                ['label' => 'Credits', 'data' => array_values($byReason), 'backgroundColor' => '#f59e0b', 'borderRadius' => 4],
            ],
            'labels' => array_map(fn ($reason) => CreditReasonLabels::label($reason), array_keys($byReason)),
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
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { grid: { display: false } },
            },
        }
        JS);
    }
}
