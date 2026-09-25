<?php

namespace App\Services;

use App\Models\Item;
use App\Models\NotificationEvent;
use App\Models\OrganizerTally;
use App\Models\ShoppingItem;
use App\Models\User;
use App\Support\ItemFreshness;
use Carbon\Carbon;

/**
 * Server-side port of all four "Your Kitchen This Week" sub-scores
 * (frontend/lib/thatfridge/scoring.ts's computeWasteSaverScore/computeFoodBalanceScore/
 * computeOrganizerScore/computeShopkeeperScore) - used by the weekly app:snapshot-kitchen-scores
 * cron (Waste Saver / Food Balance only, for the streak) and by AgentToolbox::getKitchenScore
 * (all four, so Quick Chat can answer honestly instead of only ever knowing half the picture).
 * The frontend keeps computing the same scores live/instantly for the Home screen - this is a
 * second, deliberately kept-in-sync implementation, not a replacement. If you tune a constant or
 * the formula on one side, mirror it on the other.
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

    private const ORGANIZER_MIN_CHECKED = 5;

    private const ORGANIZER_SCORE_FLOOR = 20;

    private const ORGANIZER_SCORE_CEILING = 98;

    private const SHOPKEEPER_MIN_ITEMS = 3;

    private const SHOPKEEPER_SCORE_FLOOR = 20;

    private const SHOPKEEPER_SCORE_CEILING = 98;

    /**
     * @return array{wasteScore: ?int, balanceScore: ?int, organizerScore: ?int, shopkeeperScore: ?int, overdueCount: int}
     */
    public function scoreFor(User $user): array
    {
        $items = Item::query()
            ->whereHas('section.fridge.members', fn ($q) => $q->where('users.id', $user->id))
            ->get();

        $usageHistory = $user->usageHistory()->get();

        [$overdueCount, $overdueRatio] = $this->overdueStats($items);

        return [
            'wasteScore' => $this->wasteSaverScore($user, $items->count(), $usageHistory, $overdueRatio),
            'balanceScore' => $this->foodBalanceScore($usageHistory),
            'organizerScore' => $this->organizerScore($user),
            'shopkeeperScore' => $this->shopkeeperScore($user),
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
        return ItemFreshness::effectiveDaysUntilExpiry($item) ?? 0;
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
            ->whereHas('fridge.members', fn ($q) => $q->where('users.id', $user->id))
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

    /**
     * Mirrors computeOrganizerScore: a cumulative, all-time tally (one row per user, written by
     * OrganizerTallyController::increment after every sweep) rather than a point-in-time check -
     * there's no synchronous "is this item in the right spot" signal to score on every call, so
     * a single messy week doesn't erase a long track record the way a live check would.
     */
    private function organizerScore(User $user): ?int
    {
        $tally = OrganizerTally::where('user_id', $user->id)->first();
        if (! $tally || $tally->items_checked_total < self::ORGANIZER_MIN_CHECKED) {
            return null;
        }

        $correctRatio = $tally->items_correct_total / $tally->items_checked_total;

        return max(self::ORGANIZER_SCORE_FLOOR, min(self::ORGANIZER_SCORE_CEILING, (int) round($correctRatio * 100)));
    }

    /**
     * Mirrors computeShopkeeperScore: the shopping list's own checked/unchecked split is the
     * only synchronous signal available (no purchase history to tell "avoided a duplicate buy"
     * apart from "didn't need it after all") - reads as "how much of what you decided you
     * needed has actually made it home", not shopping cleverness.
     */
    private function shopkeeperScore(User $user): ?int
    {
        $items = ShoppingItem::whereHas('fridge.members', fn ($q) => $q->where('users.id', $user->id))->get();
        if ($items->count() < self::SHOPKEEPER_MIN_ITEMS) {
            return null;
        }

        $checkedCount = $items->where('checked', true)->count();

        return max(self::SHOPKEEPER_SCORE_FLOOR, min(self::SHOPKEEPER_SCORE_CEILING, (int) round(($checkedCount / $items->count()) * 100)));
    }
}
