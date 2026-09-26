<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Support\RawJs;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\Cache;

/** Which features the AI money goes to, biggest first, as horizontal bars so long names stay readable. */
class AiSpendByFeatureChart extends ChartWidget
{
    protected static ?string $heading = 'Where the AI money goes';

    protected static ?int $sort = 5;

    protected static ?string $pollingInterval = null;

    protected static ?string $maxHeight = '300px';

    public ?string $filter = '7';

    public function getDescription(): ?string
    {
        return 'US$ per feature (OpenRouter and fal.ai together), biggest first.';
    }

    protected function getFilters(): ?array
    {
        return ['7' => 'Last 7 days', '30' => 'Last 30 days'];
    }

    protected function getData(): array
    {
        $days = (int) ($this->filter ?: 7);
        $byFeature = Cache::flexible(AdminCacheKeys::AI_BY_FEATURE.$days, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->aiSpendByFeature($days));

        return [
            'datasets' => [['label' => 'US$', 'data' => array_values($byFeature), 'backgroundColor' => '#f59e0b', 'borderRadius' => 4]],
            'labels' => array_keys($byFeature),
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
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => '$' + Number(c.parsed.x).toFixed(3) } },
            },
            scales: {
                x: { beginAtZero: true, ticks: { callback: (v) => '$' + v } },
                y: { grid: { display: false } },
            },
        }
        JS);
    }
}
