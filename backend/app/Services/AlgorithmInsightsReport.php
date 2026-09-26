<?php

namespace App\Services;

use App\Models\AlgoFeedbackEvent;
use App\Models\AnalyticsEvent;
use App\Models\GeneratedIcon;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class AlgorithmInsightsReport
{
    public const MIN_USERS = 3;

    /** Rule suggestions need a real pattern, not a coincidence: this many different people. */
    public const ACT_USERS = 5;

    /** @return array<int, array{algo: string, rules_v: int, events: int, corrections: int, correction_rate: float, trend: array<int, int>}> */
    public function scoreboard(int $days = 30): array
    {
        $since = now('UTC')->subDays($days)->toDateString();
        $rows = DB::table('algo_stats_daily')
            ->where('day', '>=', $since)
            ->selectRaw('day, algo, rules_v, sum(events) as events, sum(corrections) as corrections')
            ->groupBy('day', 'algo', 'rules_v')
            ->orderBy('day')
            ->get();

        $groups = [];
        foreach ($rows as $row) {
            $key = $row->algo.':'.$row->rules_v;
            $groups[$key] ??= [
                'algo' => $row->algo,
                'rules_v' => (int) $row->rules_v,
                'events' => 0,
                'corrections' => 0,
                'correction_rate' => 0.0,
                'trend' => [],
            ];
            $groups[$key]['events'] += (int) $row->events;
            $groups[$key]['corrections'] += (int) $row->corrections;
            $groups[$key]['trend'][] = (int) $row->events;
        }
        foreach ($groups as &$group) {
            $group['correction_rate'] = $group['events'] > 0
                ? round(100 * $group['corrections'] / $group['events'], 1)
                : 0.0;
        }

        return array_values($groups);
    }

    /** Only reveal unclassified names after at least three distinct users supplied them. */
    public function gaps(int $days = 180): array
    {
        return AlgoFeedbackEvent::query()
            ->where('occurred_at', '>=', now()->subDays($days))
            ->whereNotNull('name_key')
            ->select(['algo', 'name_key'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users')
            ->groupBy('algo', 'name_key')
            ->havingRaw('count(distinct user_id) >= ?', [self::MIN_USERS])
            ->orderByDesc('events')
            ->limit(100)
            ->get()
            ->toArray();
    }

    /** A barcode is actionable only after several people saved the same typed name. */
    public function barcodeMisses(int $days = 180): array
    {
        return AlgoFeedbackEvent::query()
            ->where('algo', 'barcode')
            ->where('kind', 'miss_named')
            ->where('occurred_at', '>=', now()->subDays($days))
            ->whereNotNull('name_key')
            ->select(['guess', 'name_key'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users')
            ->groupBy('guess', 'name_key')
            ->havingRaw('count(distinct user_id) >= ?', [self::MIN_USERS])
            ->orderByDesc('users')
            ->limit(100)
            ->get()->toArray();
    }

    /** @return list<string> */
    public function algos(int $days = 180): array
    {
        return AlgoFeedbackEvent::query()
            ->where('occurred_at', '>=', now()->subDays($days))
            ->distinct()->orderBy('algo')->pluck('algo')->all();
    }

    /** One algorithm's events by kind/outcome/source - counts and means only, no names. */
    public function breakdown(string $algo, int $days = 30): array
    {
        return AlgoFeedbackEvent::query()
            ->where('algo', $algo)
            ->where('occurred_at', '>=', now()->subDays($days))
            ->select(['kind', 'outcome', 'source'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users, avg(guess_number) as avg_guess, avg(final_number) as avg_final')
            ->groupBy('kind', 'outcome', 'source')
            ->orderByDesc('events')
            ->limit(60)
            ->get()->toArray();
    }

    /** "Guess -> final" pairs people keep correcting, hidden below MIN_USERS distinct people. */
    public function topCorrections(string $algo, int $days = 180): array
    {
        return AlgoFeedbackEvent::query()
            ->where('algo', $algo)
            ->where('outcome', 'corrected')
            ->whereNotNull('guess')->whereNotNull('final')
            ->where('occurred_at', '>=', now()->subDays($days))
            ->select(['guess', 'final'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users')
            ->groupBy('guess', 'final')
            ->havingRaw('count(distinct user_id) >= ?', [self::MIN_USERS])
            ->orderByDesc('events')
            ->limit(50)
            ->get()->toArray();
    }

    /**
     * Candidate rule changes from consistent corrections (>= ACT_USERS people). Suggestions
     * are text for a human to review - nothing here is ever applied automatically.
     *
     * @return list<array{algo: string, guess: string, final: string, events: int, users: int, share: float, suggestion: string}>
     */
    public function ruleSuggestions(int $days = 180): array
    {
        $since = now()->subDays($days);
        $pairs = AlgoFeedbackEvent::query()
            ->where('outcome', 'corrected')
            ->whereNotNull('guess')->whereNotNull('final')
            ->where('occurred_at', '>=', $since)
            ->select(['algo', 'guess', 'final'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users')
            ->groupBy('algo', 'guess', 'final')
            ->havingRaw('count(distinct user_id) >= ?', [self::ACT_USERS])
            ->orderByDesc('events')
            ->limit(50)
            ->get();

        if ($pairs->isEmpty()) {
            return [];
        }

        $totals = AlgoFeedbackEvent::query()
            ->where('occurred_at', '>=', $since)
            ->whereIn('algo', $pairs->pluck('algo')->unique()->all())
            ->whereIn('guess', $pairs->pluck('guess')->unique()->all())
            ->select(['algo', 'guess'])->selectRaw('count(*) as total')
            ->groupBy('algo', 'guess')->get()
            ->mapWithKeys(fn ($row) => [$row->algo.'|'.$row->guess => (int) $row->total]);

        return $pairs->map(function ($row) use ($totals) {
            $total = max(1, $totals[$row->algo.'|'.$row->guess] ?? (int) $row->events);
            $share = round(100 * $row->events / $total, 1);

            return [
                'algo' => $row->algo, 'guess' => $row->guess, 'final' => $row->final,
                'events' => (int) $row->events, 'users' => (int) $row->users, 'share' => $share,
                'suggestion' => "{$row->algo}: \"{$row->guess}\" was changed to \"{$row->final}\" by {$row->users} people ({$share}% of its uses) - consider changing the rule.",
            ];
        })->all();
    }

    /** Headline product metrics from the last $days days of feedback events. */
    public function outcomeMetrics(int $days = 30): array
    {
        $since = now()->subDays($days);
        $count = fn (string $algo, string $kind, ?string $outcome = null, ?string $source = null) => AlgoFeedbackEvent::query()
            ->where('algo', $algo)->where('kind', $kind)->where('occurred_at', '>=', $since)
            ->when($outcome, fn ($q) => $q->where('outcome', $outcome))
            ->when($source, fn ($q) => $q->where('source', $source))
            ->count();
        $rate = fn (int $part, int $whole) => $whole > 0 ? round(100 * $part / $whole, 1) : null;

        $used = $count('removal', 'removed', 'used');
        $wasted = $count('removal', 'removed', 'wasted');
        $alertsSent = $count('expiry_alert', 'sent');
        $alertsActed = $count('expiry_alert', 'acted', null, 'within_24h');
        $lowSent = $count('low_stock', 'sent');
        $lowActed = $count('low_stock', 'acted');
        $made = $count('recipe', 'made', null, 'suggested');

        $rank = fn (int $max) => AlgoFeedbackEvent::query()
            ->where('algo', 'recipe')->where('kind', 'made')->where('occurred_at', '>=', $since)
            ->whereNotNull('final_number')->where('final_number', '<=', $max)->count();

        $addTimes = AlgoFeedbackEvent::query()
            ->where('algo', 'add_flow')->where('kind', 'saved')->where('occurred_at', '>=', $since)
            ->whereNotNull('final_number')
            ->select('source')->selectRaw('count(*) as events, avg(final_number) as seconds')
            ->groupBy('source')->orderByDesc('events')->get()
            ->map(fn ($row) => ['source' => $row->source ?? 'unknown', 'events' => (int) $row->events, 'seconds' => round((float) $row->seconds, 1)])
            ->all();

        return [
            'days' => $days,
            'removed_used' => $used,
            'removed_wasted' => $wasted,
            'waste_rate' => $rate($wasted, $used + $wasted),
            'expiry_alerts_sent' => $alertsSent,
            'expiry_alert_action_rate' => $rate($alertsActed, $alertsSent),
            'low_stock_alerts_sent' => $lowSent,
            'low_stock_action_rate' => $rate($lowActed, $lowSent),
            'recipes_made_from_suggestions' => $made,
            'recipe_top1_rate' => $rate($rank(1), $made),
            'recipe_top3_rate' => $rate($rank(3), $made),
            'add_seconds_by_source' => $addTimes,
        ];
    }

    /**
     * Is collection alive? Per algorithm: yesterday vs the previous 7-day daily average, and the
     * share of the last 7 days' events with no class (a rule that stopped matching).
     */
    public function dataHealth(): array
    {
        $today = now('UTC')->startOfDay();
        $yesterdayStart = $today->copy()->subDay();
        $baselineStart = $today->copy()->subDays(8);

        $rows = [];
        foreach ($this->algos(30) as $algo) {
            $query = AlgoFeedbackEvent::query()->where('algo', $algo);
            $yesterday = (clone $query)->where('occurred_at', '>=', $yesterdayStart)->where('occurred_at', '<', $today)->count();
            $baseline = (clone $query)->where('occurred_at', '>=', $baselineStart)->where('occurred_at', '<', $yesterdayStart)->count() / 7;
            $week = (clone $query)->where('occurred_at', '>=', $today->copy()->subDays(7));
            $weekTotal = (clone $week)->count();
            $noClass = (clone $week)->whereNull('class')->count();

            $rows[] = [
                'algo' => $algo,
                'yesterday' => $yesterday,
                'baseline' => round($baseline, 1),
                'dropped' => $baseline >= 5 && $yesterday < $baseline * 0.5,
                'no_class_rate' => $weekTotal > 0 ? round(100 * $noClass / $weekTotal, 1) : null,
                'last_event' => optional((clone $query)->latest('occurred_at')->first())->occurred_at?->diffForHumans(),
            ];
        }

        return ['enabled' => (bool) config('app.algo_feedback_enabled'), 'rows' => $rows];
    }

    /** What people generate icons for (free text they typed), shown only when >= MIN_USERS people asked. */
    public function iconRequests(int $days = 180): array
    {
        return GeneratedIcon::query()
            ->where('created_at', '>=', now()->subDays($days))
            ->whereNotNull('prompt')
            ->selectRaw('lower(trim(prompt)) as prompt, count(*) as requests, count(distinct user_id) as users')
            ->groupByRaw('lower(trim(prompt))')
            ->havingRaw('count(distinct user_id) >= ?', [self::MIN_USERS])
            ->orderByDesc('requests')
            ->limit(50)
            ->get()->toArray();
    }

    /**
     * Signup cohorts by ISO week: share of each cohort that opened the app again at least
     * N days after signing up. Computed per signup day in SQL (analytics_events is large),
     * only for days old enough for N to have elapsed.
     *
     * @return list<array{week: string, users: int, d1: ?float, d7: ?float, d30: ?float}>
     */
    public function retention(int $weeks = 8): array
    {
        $today = now('UTC')->startOfDay();
        $days = [];
        for ($i = $weeks * 7 - 1; $i >= 0; $i--) {
            $day = $today->copy()->subDays($i);
            $signups = User::query()->where('created_at', '>=', $day)->where('created_at', '<', $day->copy()->addDay());
            $total = (clone $signups)->count();
            $entry = ['week' => $day->copy()->startOfWeek()->toDateString(), 'users' => $total];
            foreach ([1, 7, 30] as $n) {
                $bound = $day->copy()->addDays($n);
                $entry["d{$n}"] = $total > 0 && $bound->lessThanOrEqualTo($today)
                    ? AnalyticsEvent::query()->where('name', 'app_open')
                        ->whereIn('user_id', (clone $signups)->select('id'))
                        ->where('occurred_at', '>=', $bound)
                        ->distinct()->count('user_id')
                    : null;
                $entry["d{$n}_base"] = $total > 0 && $bound->lessThanOrEqualTo($today) ? $total : 0;
            }
            $days[] = $entry;
        }

        $cohorts = [];
        foreach ($days as $day) {
            $c = &$cohorts[$day['week']];
            $c ??= ['week' => $day['week'], 'users' => 0, 'd1' => 0, 'd7' => 0, 'd30' => 0, 'b1' => 0, 'b7' => 0, 'b30' => 0];
            $c['users'] += $day['users'];
            foreach ([1, 7, 30] as $n) {
                $c["d{$n}"] += $day["d{$n}"] ?? 0;
                $c["b{$n}"] += $day["d{$n}_base"];
            }
            unset($c);
        }

        return array_values(array_filter(array_map(fn ($c) => [
            'week' => $c['week'], 'users' => $c['users'],
            'd1' => $c['b1'] > 0 ? round(100 * $c['d1'] / $c['b1'], 1) : null,
            'd7' => $c['b7'] > 0 ? round(100 * $c['d7'] / $c['b7'], 1) : null,
            'd30' => $c['b30'] > 0 ? round(100 * $c['d30'] / $c['b30'], 1) : null,
        ], $cohorts), fn ($c) => $c['users'] > 0));
    }
}
