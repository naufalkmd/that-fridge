<?php

namespace App\Support;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * The free tier's weekly AI-chat allowance, shared by every path that spends it:
 *
 *  - real Quick Chat messages (AgentController::send) — counted from chat_history rows
 *  - Home tip-card / "Activate {agent}" compact calls — not persisted, tracked in cache
 *  - memory extraction (MemoryController::extract) — an LLM call the client fires right
 *    after a chat reply, so it's only allowed while the user still has chat allowance
 *
 * Mirrors apps/mobile/src/lib/chatQuota.ts's FREE_CHATS_PER_WEEK (client-side pre-check).
 */
class ChatQuota
{
    public const FREE_PER_WEEK = 5;

    public static function compactCacheKey(User $user): string
    {
        return 'compact_chat_quota:'.$user->id.':'.Carbon::now()->startOfWeek(Carbon::MONDAY)->format('oW');
    }

    /** Real chat messages this week + compact calls tracked in cache. */
    public static function usedThisWeek(User $user): int
    {
        $weekStart = Carbon::now()->startOfWeek(Carbon::MONDAY);

        return $user->chatHistory()->where('created_at', '>=', $weekStart)->count()
            + (int) Cache::get(self::compactCacheKey($user), 0);
    }

    /** True when a non-Pro user has spent their weekly free allowance. Pro is never exhausted. */
    public static function isExhaustedFor(User $user): bool
    {
        return ! $user->isPro() && self::usedThisWeek($user) >= self::FREE_PER_WEEK;
    }

    /** Count one compact / tip-card call against a non-Pro user's weekly budget. */
    public static function recordCompactCall(User $user): void
    {
        if ($user->isPro()) {
            return;
        }

        $key = self::compactCacheKey($user);
        Cache::put($key, (int) Cache::get($key, 0) + 1, now()->addWeek());
    }
}
