<?php

namespace App\Filament\Pages;

use App\Filament\Widgets;
use Filament\Pages\Dashboard as BaseDashboard;

/**
 * The daily glance: launch to-dos, headline numbers, signups, AI provider health, onboarding,
 * feedback and scheduled jobs. The AI spend charts live on AI costs, next to the tables they chart.
 */
class Dashboard extends BaseDashboard
{
    public function getWidgets(): array
    {
        return [
            Widgets\LaunchTodos::class,
            Widgets\StatsOverview::class,
            Widgets\SignupsChart::class,
            Widgets\AiProviderStats::class,
            Widgets\OnboardingFunnelWidget::class,
            Widgets\LatestFeedback::class,
            Widgets\ScheduledJobs::class,
        ];
    }
}
