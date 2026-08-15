<?php

namespace App\Services;

use App\Models\Item;
use App\Models\NotificationEvent;
use App\Models\User;
use App\Support\ItemFreshness;
use Carbon\Carbon;

/**
 * Server-side port of the "Your Kitchen This Week" scores
 * (frontend/lib/thatfridge/scoring.ts's computeWasteSaverScore/computeFoodBalanceScore), used
 * only by the weekly app:snapshot-kitchen-scores cron so streaks are computed independent of
 * whether the user actually opened the app that week. The frontend keeps computing the same
 * scores live/instantly for the Home screen - this is a second, deliberately kept-in-sync
 * implementation, not a replacement. If you tune a constant or the formula on one side, mirror
 * it on the other.
 *
 * One documented divergence from the frontend: usage_history rows recorded before the
 * nutrition-category taxonomy existed have category = null. The frontend's live view falls back
 * to guessing a category from the icon so those old rows still count; this server-side port does
 * not re-implement that icon-guessing heuristic and instead treats a null category the same as
 * "other_extras" (excluded from Food Balance) here. Only affects pre-migration rows.
 */
class KitchenScoreService
{
    private const WASTE_BASE_SCORE = 75;

    private const WASTE_SCORE_FLOOR = 20;

    private const WASTE_SCORE_CEILING = 98;

    private const OVERDUE_PENALTY_CAP = 30;

    private const RESPONSIVENESS_SWING = 30;

    private const ENGAGEMENT_BONUS_CAP = 10;

    private const ENGAGEMENT_LOOKBACK_DAYS = 14;

    private const COUNTED_CATEGORIES = ['protein', 'vegetables', 'fruit', 'grains', 'dairy'];

    private const BALANCE_MIN_ENTRIES = 3;

    private const BALANCE_LOOKBACK_DAYS = 30;

    private const VARIETY_WEIGHT = 55;

    private const EVENNESS_WEIGHT = 45;

    private const BALANCE_SCORE_FLOOR = 20;

    private const BALANCE_SCORE_CEILING = 98;

    /**
     * @return array{wasteScore: ?int, balanceScore: ?int, overdueCount: int}
     */
    public function scoreFor(User $user): array
    {
        $items = Item::query()
            ->whereHas('section.fridge', fn ($q) => $q->where('user_id', $user->id))
            ->get();

        $usageHistory = $user->usageHistory()->get();

        [$overdueCount, $overdueRatio] = $this->overdueStats($items);

        return [
            'wasteScore' => $this->wasteSaverScore($user, $items->count(), $usageHistory, $overdueRatio),
            'balanceScore' => $this->foodBalanceScore($usageHistory),
            'overdueCount' => $overdueCount,
        ];
    }

    /**
     * @return array{0: int, 1: float}
     */
    private function overdueStats($items): array
    {
        $overdueCount = 0;
        foreach ($items as $item) {
            if ($this->daysFor($item) < 0) {
                $overdueCount++;
            }
        }

        $total = $items->count();

        return [$overdueCount, $total > 0 ? $overdueCount / $total : 0.0];
    }

    /**
     * A missing expiry_date resolves to 0 (not null) here - matching the frontend's client-side
     * collapse (see apiClient.ts's toClientItem) that this score formula was written against.
     */
    private function daysFor(Item $item): int
    {
        return ItemFreshness::daysUntilExpiry($item) ?? 0;
    }

    private function wasteSaverScore(User $user, int $itemCount, $usageHistory, float $overdueRatio): ?int
    {
        $hasAnyData = $itemCount > 0 || $usageHistory->isNotEmpty();
        if (! $hasAnyData) {
            return null;
        }

        $overduePenalty = min(self::OVERDUE_PENALTY_CAP, (int) round($overdueRatio * 60));

        $expiringEvents = NotificationEvent::query()
            ->where('kind', 'expiring')
            ->whereHas('fridge', fn ($q) => $q->where('user_id', $user->id))
            ->get();

        $responsivenessAdj = 0;
        if ($expiringEvents->isNotEmpty()) {
            $doneCount = $expiringEvents->where('done', true)->count();
            $responsivenessAdj = (int) round(($doneCount / $expiringEvents->count() - 0.5) * self::RESPONSIVENESS_SWING);
        }

        $cutoff = Carbon::now()->subDays(self::ENGAGEMENT_LOOKBACK_DAYS);
        $recentUsageCount = $usageHistory->filter(fn ($h) => $h->last_used_at && $h->last_used_at->greaterThanOrEqualTo($cutoff))->count();
        $engagementBonus = min(self::ENGAGEMENT_BONUS_CAP, $recentUsageCount * 2);

        $raw = self::WASTE_BASE_SCORE - $overduePenalty + $responsivenessAdj + $engagementBonus;

        return max(self::WASTE_SCORE_FLOOR, min(self::WASTE_SCORE_CEILING, (int) round($raw)));
    }

    private function foodBalanceScore($usageHistory): ?int
    {
        $cutoff = Carbon::now()->subDays(self::BALANCE_LOOKBACK_DAYS);
        $recentUsage = $usageHistory->filter(fn ($h) => $h->last_used_at && $h->last_used_at->greaterThanOrEqualTo($cutoff));

        $countable = $recentUsage->filter(fn ($h) => $h->category && in_array($h->category, self::COUNTED_CATEGORIES, true));

        if ($countable->count() < self::BALANCE_MIN_ENTRIES) {
            return null;
        }

        $groupCounts = array_fill_keys(self::COUNTED_CATEGORIES, 0);
        foreach ($countable as $h) {
            $groupCounts[$h->category] += $h->count;
        }

        $total = array_sum($groupCounts);
        $usedGroups = array_filter($groupCounts, fn ($c) => $c > 0);
        $varietyRatio = count($usedGroups) / count(self::COUNTED_CATEGORIES);
        $maxShare = $total > 0 ? max($groupCounts) / $total : 1;

        $raw = self::VARIETY_WEIGHT * $varietyRatio + self::EVENNESS_WEIGHT * (1 - $maxShare);

        return max(self::BALANCE_SCORE_FLOOR, min(self::BALANCE_SCORE_CEILING, (int) round($raw)));
    }
}
