<?php

namespace App\Services;

use App\Models\AlgoFeedbackEvent;
use Illuminate\Support\Facades\DB;

final class AlgorithmInsightsReport
{
    public const MIN_USERS = 3;

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
}
