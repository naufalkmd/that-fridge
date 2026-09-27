<?php

namespace App\Filament\Pages;

use App\Filament\Resources\ApiUsageLogResource;
use App\Filament\Resources\UserResource;
use App\Services\AiCostReport;
use App\Support\AdminCacheKeys;
use Filament\Facades\Filament;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Cache;
use Livewire\Attributes\Url;

/**
 * What each AI feature and each user really costs, next to the credits charged for it - the numbers
 * to check before changing a price in CreditCost. Drill into single calls from the AI call log.
 */
class AiCosts extends Page
{
    protected static ?string $navigationIcon = 'heroicon-o-calculator';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $navigationLabel = 'AI costs';

    protected static ?string $title = 'AI costs';

    protected static string $view = 'filament.pages.ai-costs';

    public const PERIODS = [7 => 'Last 7 days', 30 => 'Last 30 days', 90 => 'Last 90 days'];

    #[Url]
    public int $days = 30;

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function period(): int
    {
        return array_key_exists($this->days, self::PERIODS) ? $this->days : 30;
    }

    /** @return array{totals: array, features: list<array>, users: list<array>} */
    public function report(): array
    {
        $days = $this->period();

        return Cache::flexible(AdminCacheKeys::AI_COSTS.$days, AdminCacheKeys::DASHBOARD_TTL, function () use ($days) {
            $report = app(AiCostReport::class);

            return [
                'totals' => $report->totals($days),
                'features' => $report->byFeature($days),
                'users' => $report->byUser($days),
            ];
        });
    }

    public function userUrl(int $id): string
    {
        return UserResource::getUrl('view', ['record' => $id]);
    }

    public function logUrl(?int $userId = null, ?string $feature = null): string
    {
        $filters = [];
        if ($userId !== null) {
            $filters['user_id'] = ['value' => $userId];
        }
        if ($feature !== null) {
            $filters['feature'] = ['value' => $feature];
        }

        return ApiUsageLogResource::getUrl('index', $filters ? ['tableFilters' => $filters] : []);
    }
}
