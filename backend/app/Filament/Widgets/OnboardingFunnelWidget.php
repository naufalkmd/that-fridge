<?php

namespace App\Filament\Widgets;

use App\Services\OnboardingFunnelReport;
use App\Support\AdminCacheKeys;
use Filament\Widgets\Widget;
use Illuminate\Support\Facades\Cache;

class OnboardingFunnelWidget extends Widget
{
    protected static string $view = 'filament.widgets.onboarding-funnel';

    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 1;

    public const DAYS = 14;

    protected function getViewData(): array
    {
        return Cache::flexible(AdminCacheKeys::ONBOARDING_FUNNEL, AdminCacheKeys::DASHBOARD_TTL, function () {
            $report = app(OnboardingFunnelReport::class);

            return [
                'days' => self::DAYS,
                'steps' => $report->stepCounts(self::DAYS),
                'authMethods' => $report->authMethods(self::DAYS)->all(),
                'other' => $report->otherEventNames(self::DAYS)->all(),
            ];
        });
    }
}
