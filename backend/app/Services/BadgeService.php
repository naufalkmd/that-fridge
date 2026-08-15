<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserBadge;

class BadgeService
{
    /**
     * badge_key => progress needed to earn it. Mirrored on the frontend in
     * lib/thatfridge/badges.ts's BADGE_CATALOG for display metadata (label/description/emoji) -
     * keep both in sync if a key is added, removed, or its threshold changes.
     */
    public const BADGES = [
        // Marked "used" via the Mark-as-made recipe flow while still within 3 days of expiry.
        'rescued_10' => 10,
        // Imported a recipe via the "paste a link" flow at least once.
        'first_link_recipe' => 1,
        // Food Balance's variety hit all 5 counted food groups at least once.
        'full_week_variety' => 1,
        // A weekly kitchen-score snapshot landed with zero overdue items.
        'zero_waste_week' => 1,
    ];

    /**
     * Idempotent-safe: once a badge is earned, further calls leave progress/earned_at
     * untouched rather than accumulating past the threshold forever.
     */
    public function awardProgress(User $user, string $badgeKey, int $incrementBy): UserBadge
    {
        $badge = UserBadge::query()->firstOrCreate(
            ['user_id' => $user->id, 'badge_key' => $badgeKey],
            ['progress' => 0]
        );

        if ($badge->earned_at) {
            return $badge;
        }

        $threshold = self::BADGES[$badgeKey];
        $badge->progress = min($threshold, $badge->progress + $incrementBy);

        if ($badge->progress >= $threshold) {
            $badge->earned_at = now();
        }

        $badge->save();

        return $badge;
    }
}
