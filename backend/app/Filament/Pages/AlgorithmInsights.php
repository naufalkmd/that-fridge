<?php

namespace App\Filament\Pages;

use App\Models\AdminAuditLog;
use App\Models\Product;
use App\Services\AlgorithmInsightsReport;
use App\Support\AdminCacheKeys;
use App\Support\FoodIconMatcher;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AlgorithmInsights extends Page
{
    protected static ?string $navigationIcon = 'heroicon-o-chart-bar-square';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $title = 'Algorithm insights';

    protected static string $view = 'filament.pages.algorithm-insights';

    /** The algorithm whose breakdown tab is open. */
    public string $algo = '';

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
                        $name = (string) $gap['name_key'];
                        fputcsv($out, [$gap['algo'], preg_match('/^[=+@-]/', $name) ? "'".$name : $name,
                            $gap['events'], $gap['users']]);
                    }
                    fclose($out);
                }, 'algorithm-gaps.csv', ['Content-Type' => 'text/csv'])),
            Action::make('exportSuggestions')
                ->label('Export rule suggestions CSV')
                ->action(fn () => response()->streamDownload(function () {
                    $out = fopen('php://output', 'w');
                    fputcsv($out, ['algorithm', 'guess', 'final', 'events', 'users', 'share_percent', 'suggestion']);
                    foreach ($this->ruleSuggestions() as $row) {
                        fputcsv($out, array_map(
                            fn ($v) => is_string($v) && preg_match('/^[=+@-]/', $v) ? "'".$v : $v,
                            [$row['algo'], $row['guess'], $row['final'], $row['events'], $row['users'], $row['share'], $row['suggestion']],
                        ));
                    }
                    fclose($out);
                }, 'rule-suggestions.csv', ['Content-Type' => 'text/csv'])),
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

    public function mount(): void
    {
        $this->algo = $this->algos()[0] ?? '';
    }

    public function algos(): array
    {
        return app(AlgorithmInsightsReport::class)->algos();
    }

    public function breakdown(): array
    {
        return $this->algo === '' ? [] : app(AlgorithmInsightsReport::class)->breakdown($this->algo);
    }

    public function topCorrections(): array
    {
        return $this->algo === '' ? [] : app(AlgorithmInsightsReport::class)->topCorrections($this->algo);
    }

    public function ruleSuggestions(): array
    {
        return app(AlgorithmInsightsReport::class)->ruleSuggestions();
    }

    public function metrics(): array
    {
        return Cache::flexible(AdminCacheKeys::ALGORITHM_METRICS, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->outcomeMetrics());
    }

    public function health(): array
    {
        return Cache::flexible(AdminCacheKeys::ALGORITHM_HEALTH, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->dataHealth());
    }

    public function retention(): array
    {
        return Cache::flexible(AdminCacheKeys::RETENTION, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->retention());
    }

    public function iconRequests(): array
    {
        return app(AlgorithmInsightsReport::class)->iconRequests();
    }

    /**
     * Promote a shared unknown barcode to a Product. Only a pair the queue itself shows
     * (>= MIN_USERS people typed the same name) can be promoted; the admin can refine the
     * name/icon afterwards in Products.
     */
    public function createProduct(string $barcode, string $name): void
    {
        $shown = collect($this->barcodeMisses())
            ->contains(fn ($row) => (string) $row['guess'] === $barcode && (string) $row['name_key'] === $name);
        if (! $shown || Product::where('barcode', $barcode)->exists()) {
            Notification::make()->title('Not available to add')->warning()->send();

            return;
        }

        $product = Product::create([
            'barcode' => $barcode,
            'name' => Str::title($name),
            'icon' => FoodIconMatcher::guess($name) ?? 'generic',
        ]);
        AdminAuditLog::record('created_product_from_insights', $product, ['barcode' => $barcode, 'name' => $product->name]);
        Notification::make()->title('Product created')->body('Refine the name and icon in Products.')->success()->send();
    }
}
