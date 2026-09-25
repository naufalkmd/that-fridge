<?php

namespace App\Filament\Pages;

use App\Services\AlgorithmInsightsReport;
use App\Support\AdminCacheKeys;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Cache;

class AlgorithmInsights extends Page
{
    protected static ?string $navigationIcon = 'heroicon-o-chart-bar-square';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $title = 'Algorithm insights';

    protected static string $view = 'filament.pages.algorithm-insights';

    protected function getHeaderActions(): array
    {
        return [
            Action::make('exportGaps')
                ->label('Export shared gaps CSV')
                ->action(fn () => response()->streamDownload(function () {
                    $out = fopen('php://output', 'w');
                    fputcsv($out, ['algorithm', 'name', 'events', 'users']);
                    foreach ($this->gaps() as $gap) {
                        // The shared-name threshold is enforced in gaps() before export.
                        $name = (string) $gap->name_key;
                        fputcsv($out, [$gap->algo, preg_match('/^[=+@-]/', $name) ? "'".$name : $name,
                            $gap->events, $gap->users]);
                    }
                    fclose($out);
                }, 'algorithm-gaps.csv', ['Content-Type' => 'text/csv'])),
        ];
    }

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function scoreboard(): array
    {
        return Cache::flexible(AdminCacheKeys::ALGORITHM_INSIGHTS, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->scoreboard());
    }

    public function gaps(): array
    {
        return Cache::flexible(AdminCacheKeys::ALGORITHM_GAPS, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->gaps());
    }

    public function barcodeMisses(): array
    {
        return app(AlgorithmInsightsReport::class)->barcodeMisses();
    }
}
