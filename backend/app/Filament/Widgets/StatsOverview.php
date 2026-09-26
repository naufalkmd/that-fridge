<?php

namespace App\Filament\Widgets;

use App\Services\AdminStats;
use App\Support\AdminCacheKeys;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Facades\Cache;

class StatsOverview extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    // Numbers are cached for minutes anyway; Filament's default 5s polling would just
    // re-request the same cached payload every 5 seconds per open tab.
    protected static ?string $pollingInterval = null;

    protected ?string $heading = 'Users and content';

    protected function getStats(): array
    {
        // Counts across whole tables - served stale-while-revalidate so a load never waits on them.
        $s = Cache::flexible(AdminCacheKeys::STATS, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->snapshot());
        $spent = array_sum(Cache::flexible(AdminCacheKeys::CREDIT_SPEND, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->creditSpendByReason(7)));

        // New accounts per day over the last two weeks: the little line under the signups number.
        $daily = Cache::flexible(AdminCacheKeys::SIGNUPS, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->signupsByDay(30));
        $trend = array_slice(array_map(fn ($a, $g, $e) => $a + $g + $e, $daily['apple'], $daily['google'], $daily['email']), -14);

        return [
            Stat::make('Real users', number_format($s['users']['total']))
                ->description("{$s['users']['active_7d']} active in the last 7 days")
                ->descriptionIcon('heroicon-m-user-group')
                ->color('primary'),
            Stat::make('New signups (7d)', number_format($s['signups']['last_7d']))
                ->description("{$s['signups']['last_24h']} today · {$s['signups']['last_30d']} in 30 days")
                ->descriptionIcon('heroicon-m-user-plus')
                ->chart($trend)
                ->color('success'),
            Stat::make('Pro', number_format($s['users']['pro']))
                ->description("{$s['users']['conversion_pct']}% of users are Pro")
                ->descriptionIcon('heroicon-m-star')
                ->color('warning'),
            Stat::make('Fridges', number_format($s['content']['fridges']))
                ->description("{$s['content']['shared_fridges']} shared · ".number_format($s['content']['items']).' items')
                ->descriptionIcon('heroicon-m-archive-box')
                ->color('info'),
            Stat::make('AI credits spent (7d)', number_format($spent))
                ->description("{$s['ai_last_7d']['chat_messages']} chat messages · {$s['ai_last_7d']['image_generations']} images")
                ->descriptionIcon('heroicon-m-sparkles')
                ->color('gray'),
            Stat::make('Custom recipes', number_format($s['content']['custom_recipes']))
                ->description('Written or saved by users')
                ->descriptionIcon('heroicon-m-book-open')
                ->color('gray'),
        ];
    }
}
