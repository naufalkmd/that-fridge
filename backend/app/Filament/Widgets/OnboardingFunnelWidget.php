<?php

namespace App\Filament\Widgets;

use App\Services\OnboardingFunnelReport;
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
        return Cache::remember('admin:funnel:'.self::DAYS, now()->addMinutes(5), function () {
            $report = app(OnboardingFunnelReport::class);
            $events = $report->events(self::DAYS);

            return [
                'days' => self::DAYS,
                'steps' => $report->steps($events),
                'authMethods' => $report->authMethods($events)->all(),
                'other' => $report->otherEventNames($events)->all(),
            ];
        });
    }
}
