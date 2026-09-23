<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Facades\Cache;

class StatsOverview extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    protected function getStats(): array
    {
        // Counts across whole tables on every dashboard load - cache them briefly.
        $s = Cache::remember('admin:stats', now()->addMinutes(5), fn () => app(AdminStats::class)->snapshot());
        $spent = array_sum(Cache::remember('admin:credit-spend:7', now()->addMinutes(5), fn () => app(AdminStats::class)->creditSpendByReason(7)));

        return [
            Stat::make('Real users', number_format($s['users']['total']))
                ->description("{$s['users']['active_7d']} active in the last 7 days"),
            Stat::make('New signups (7d)', number_format($s['signups']['last_7d']))
                ->description("{$s['signups']['last_24h']} today · {$s['signups']['last_30d']} in 30 days"),
            Stat::make('Pro', number_format($s['users']['pro']))
                ->description("{$s['users']['conversion_pct']}% conversion"),
            Stat::make('Fridges', number_format($s['content']['fridges']))
                ->description("{$s['content']['shared_fridges']} shared · ".number_format($s['content']['items']).' items'),
            Stat::make('AI credits spent (7d)', number_format($spent))
                ->description("{$s['ai_last_7d']['chat_messages']} chat messages · {$s['ai_last_7d']['image_generations']} images"),
            Stat::make('Custom recipes', number_format($s['content']['custom_recipes'])),
        ];
    }
}
