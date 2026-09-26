<?php

namespace App\Filament\Widgets;

use App\Filament\Pages\AiBalances;
use App\Services\AdminStats;
use App\Services\AiProviderBalance;
use App\Support\AdminCacheKeys;
use App\Support\Money;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * What the paid AI providers cost, at a glance: OpenRouter (chat, scans, recipes) and fal.ai (icons), the live OpenRouter balance,
 * and the number that says whether credits are priced right - what the AI cost per credit users spent. Figures come from our own call
 * log (ApiUsageLog); the provider dashboards stay the source of truth for billing.
 */
class AiProviderStats extends StatsOverviewWidget
{
    protected static ?int $sort = 3;

    protected static ?string $pollingInterval = null;

    protected ?string $heading = 'AI providers (last 7 days)';

    protected ?string $description = 'What OpenRouter and fal.ai cost, from our own call log. fal.ai is an estimate; check each provider\'s dashboard for the exact bill.';

    protected function getColumns(): int
    {
        return 3;
    }

    protected function getStats(): array
    {
        $usage = Cache::flexible(AdminCacheKeys::AI_USAGE.'7', AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->aiUsageSummary(7));
        $byDay = Cache::flexible(AdminCacheKeys::AI_BY_DAY.'14', AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->aiSpendByDay(14));
        $credits = array_sum(Cache::flexible(AdminCacheKeys::CREDIT_SPEND, AdminCacheKeys::DASHBOARD_TTL, fn () => app(AdminStats::class)->creditSpendByReason(7)));
        $account = app(AiProviderBalance::class)->openRouter();

        $or = $usage['openrouter'];
        $fal = $usage['fal'];
        $failRate = $or['calls'] > 0 ? $or['failed'] / $or['calls'] : 0.0;

        $orDescription = number_format($or['calls']).' calls · '.self::tokens($or['tokens']).' tokens'
            .($or['failed'] > 0 ? ' · '.$or['failed'].' failed' : '')
            .($or['unpriced'] > 0 ? ' · '.$or['unpriced'].' without a price' : '');

        $totalCost = $or['cost'] + $fal['cost'];
        $perCredit = $credits > 0 ? $totalCost / $credits : null;

        return [
            Stat::make('OpenRouter', Money::usd($or['cost']))
                ->description($orDescription)
                ->descriptionIcon($failRate > 0.05 ? 'heroicon-m-exclamation-triangle' : 'heroicon-m-check-circle')
                ->color($failRate > 0.05 ? 'danger' : 'success')
                ->chart(array_map(fn ($v) => (float) $v, $byDay['openrouter'])),
            Stat::make('fal.ai (estimate)', '≈ '.Money::usd($fal['cost']))
                ->description(number_format($fal['calls']).' image calls'.($fal['failed'] > 0 ? ' · '.$fal['failed'].' failed' : ''))
                ->descriptionIcon('heroicon-m-photo')
                ->color('info')
                ->chart(array_map(fn ($v) => (float) $v, $byDay['fal'])),
            $this->balanceStat($account),
            $this->falBalanceStat(app(AiProviderBalance::class)->fal()),
            Stat::make('AI cost per credit', $perCredit === null ? '–' : Money::usd($perCredit))
                ->description($perCredit === null
                    ? 'No credits spent yet'
                    : 'A credit is priced at about $0.01. '.($perCredit > 0.01 ? 'You are losing money on each one.' : 'You keep the difference.'))
                ->descriptionIcon($perCredit !== null && $perCredit > 0.01 ? 'heroicon-m-arrow-trending-down' : 'heroicon-m-arrow-trending-up')
                ->color($perCredit !== null && $perCredit > 0.01 ? 'danger' : 'success'),
        ];
    }

    /** @param  array{used: ?float, remaining: ?float, limit: ?float}|null  $account */
    private function balanceStat(?array $account): Stat
    {
        if ($account === null) {
            return Stat::make('OpenRouter balance', 'Unavailable')
                ->description('Check openrouter.ai/credits')
                ->descriptionIcon('heroicon-m-question-mark-circle')
                ->color('gray');
        }
        if ($account['remaining'] !== null) {
            $low = $account['limit'] !== null && $account['limit'] > 0 && $account['remaining'] / $account['limit'] < 0.15;

            return Stat::make('OpenRouter balance', Money::usd($account['remaining']).' left')
                ->description(($account['limit'] !== null ? 'of '.Money::usd($account['limit']).' · ' : '').($low ? 'top up soon' : 'live from OpenRouter'))
                ->descriptionIcon($low ? 'heroicon-m-exclamation-triangle' : 'heroicon-m-banknotes')
                ->color($low ? 'danger' : 'success');
        }

        return Stat::make('OpenRouter used to date', Money::usd((float) $account['used']))
            ->description('No spend limit is set on this key')
            ->descriptionIcon('heroicon-m-banknotes')
            ->color('gray');
    }

    /** @param  array{balance: float, remaining: float, spent_since: float, as_of: Carbon}|null  $fal */
    private function falBalanceStat(?array $fal): Stat
    {
        if ($fal === null) {
            return Stat::make('fal.ai balance', 'Not set')
                ->description('Enter it from fal.ai/dashboard')
                ->descriptionIcon('heroicon-m-question-mark-circle')
                ->color('gray')
                ->url(AiBalances::getUrl());
        }
        $low = $fal['remaining'] < 2.0;

        return Stat::make('fal.ai balance (estimate)', '≈ '.Money::usd($fal['remaining']).' left')
            ->description(($low ? 'top up soon · ' : '').Money::usd($fal['balance']).' on '.$fal['as_of']->format('j M').', minus '.Money::usd($fal['spent_since']).' since')
            ->descriptionIcon($low ? 'heroicon-m-exclamation-triangle' : 'heroicon-m-banknotes')
            ->color($low ? 'danger' : 'success')
            ->url(AiBalances::getUrl());
    }

    private static function tokens(int $n): string
    {
        return $n >= 1_000_000 ? round($n / 1_000_000, 1).'M' : ($n >= 1000 ? round($n / 1000).'k' : (string) $n);
    }
}
