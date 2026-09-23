<?php

namespace App\Services;

use App\Models\AiCreditLedger;
use App\Models\ChatHistory;
use App\Models\Fridge;
use App\Models\GeneratedIcon;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * The operator's at-a-glance counters, shared by `app:stats` and the admin dashboard so the
 * two never disagree. Demo / App Review accounts are excluded everywhere - they aren't customers.
 */
class AdminStats
{
    public function snapshot(): array
    {
        $now = Carbon::now();
        $day = $now->copy()->subDay();
        $week = $now->copy()->subDays(7);
        $month = $now->copy()->subDays(30);

        $real = User::where('is_demo', false);

        $stats = [
            'users' => [
                'total' => (clone $real)->count(),
                'verified' => (clone $real)->whereNotNull('email_verified_at')->count(),
                'pro' => (clone $real)->where('pro_expires_at', '>', $now)->count(),
                'via_apple' => (clone $real)->where('oauth_provider', 'apple')->count(),
                'via_google' => (clone $real)->where('oauth_provider', 'google')->count(),
                'via_email' => (clone $real)->whereNull('oauth_provider')->count(),
                'active_7d' => (clone $real)->where('last_active_on', '>=', $week->toDateString())->count(),
            ],
            'signups' => [
                'last_24h' => (clone $real)->where('created_at', '>=', $day)->count(),
                'last_7d' => (clone $real)->where('created_at', '>=', $week)->count(),
                'last_30d' => (clone $real)->where('created_at', '>=', $month)->count(),
            ],
            'ai_last_7d' => [
                'image_generations' => GeneratedIcon::where('created_at', '>=', $week)->count(),
                'credits_spent' => (int) GeneratedIcon::where('created_at', '>=', $week)->sum('credits'),
                'chat_messages' => ChatHistory::where('created_at', '>=', $week)->count(),
            ],
            'content' => [
                'fridges' => Fridge::count(),
                'shared_fridges' => Fridge::has('members', '>', 1)->count(),
                'items' => Item::count(),
                'custom_recipes' => Recipe::whereNotNull('user_id')->count(),
            ],
        ];

        // Conversion rate, guarded against div-by-zero.
        $stats['users']['conversion_pct'] = $stats['users']['total'] > 0
            ? round($stats['users']['pro'] / $stats['users']['total'] * 100, 1)
            : 0.0;

        return $stats;
    }

    /**
     * Credits spent per ledger reason over the last N days, biggest first. Spends are
     * negative deltas; admin adjustments are folded into one 'admin_adjust' bucket.
     *
     * @return array<string, int>
     */
    public function creditSpendByReason(int $days = 7): array
    {
        return AiCreditLedger::where('created_at', '>=', Carbon::now()->subDays($days))
            ->where('delta', '<', 0)
            ->get(['reason', 'delta'])
            ->groupBy(fn ($row) => str_starts_with($row->reason, 'admin_adjust') ? 'admin_adjust' : $row->reason)
            ->map(fn ($rows) => (int) -$rows->sum('delta'))
            ->sortDesc()
            ->all();
    }

    /**
     * Real-user signups per day for the last N days, split by sign-in method. Grouped in PHP
     * to stay dialect-agnostic (sqlite in tests, pg in prod); volume is tiny.
     *
     * @return array{labels: list<string>, apple: list<int>, google: list<int>, email: list<int>}
     */
    public function signupsByDay(int $days = 30): array
    {
        $start = Carbon::today()->subDays($days - 1);
        $users = User::where('is_demo', false)
            ->where('created_at', '>=', $start)
            ->get(['created_at', 'oauth_provider']);

        $out = ['labels' => [], 'apple' => [], 'google' => [], 'email' => []];
        for ($d = $start->copy(); $d->lte(Carbon::today()); $d->addDay()) {
            $onDay = $users->filter(fn ($u) => $u->created_at->isSameDay($d));
            $out['labels'][] = $d->format('M j');
            $out['apple'][] = $onDay->where('oauth_provider', 'apple')->count();
            $out['google'][] = $onDay->where('oauth_provider', 'google')->count();
            $out['email'][] = $onDay->whereNull('oauth_provider')->count();
        }

        return $out;
    }
}
