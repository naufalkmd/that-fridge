<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Support\RawJs;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

/** AI cost per day, stacked by provider, in US$. One glance answers "did spend jump, and on what". */
class AiSpendChart extends ChartWidget
{
    protected static ?string $heading = 'AI cost per day';

    protected static ?int $sort = 4;

    protected static ?string $pollingInterval = null;

    protected static ?string $maxHeight = '260px';

    public ?string $filter = '14';

    public function getDescription(): ?string
    {
        return 'US$ per day, OpenRouter and fal.ai stacked. fal.ai is an estimate.';
    }

    protected function getFilters(): ?array
    {
        return ['7' => 'Last 7 days', '14' => 'Last 14 days', '30' => 'Last 30 days'];
    }

    protected function getData(): array
    {
        $days = (int) ($this->filter ?: 14);
        $d = Cache::flexible(AdminCacheKeys::AI_BY_DAY.$days, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->aiSpendByDay($days));

        return [
            'datasets' => [
                ['label' => 'OpenRouter', 'data' => $d['openrouter'], 'backgroundColor' => '#f59e0b', 'borderRadius' => 3],
                ['label' => 'fal.ai (estimate)', 'data' => $d['fal'], 'backgroundColor' => '#6366f1', 'borderRadius' => 3],
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
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (c) => c.dataset.label + ': $' + Number(c.parsed.y).toFixed(3) } },
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => '$' + v } },
            },
        }
        JS);
    }
}
