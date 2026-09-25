<?php

namespace App\Console\Commands;

use App\Models\AlgoFeedbackEvent;
use App\Services\AlgorithmInsightsReport;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

#[Signature('app:rollup-algo-stats {--date= : UTC day to recalculate (YYYY-MM-DD); defaults to yesterday}')]
#[Description('Rebuild one day of anonymous algorithm-feedback statistics')]
class RollupAlgoStats extends Command
{
    public function handle(): int
    {
        $day = $this->option('date') ?: now('UTC')->subDay()->toDateString();
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) || Carbon::parse($day)->toDateString() !== $day) {
            $this->error('Date must be YYYY-MM-DD.');

            return self::FAILURE;
        }

        $start = Carbon::parse($day, 'UTC')->startOfDay();
        $end = $start->copy()->addDay();

        // SQL does the grouping; only aggregate rows enter PHP. Rebuild rather than add to
        // counters so repeat runs and late deletions cannot double count a day.
        $rows = AlgoFeedbackEvent::query()
            ->where('occurred_at', '>=', $start)
            ->where('occurred_at', '<', $end)
            ->select(['algo', 'kind', 'class', 'name_key', 'source', 'rules_v'])
            ->selectRaw('count(*) as events, count(distinct user_id) as users')
            ->selectRaw("sum(case when outcome = 'corrected' then 1 else 0 end) as corrections")
            ->selectRaw('sum(guess_number) as sum_guess, sum(final_number) as sum_final')
            ->groupBy('algo', 'kind', 'class', 'name_key', 'source', 'rules_v')
            ->get();

        DB::transaction(function () use ($day, $rows) {
            DB::table('algo_stats_daily')->where('day', $day)->delete();
            foreach ($rows as $row) {
                DB::table('algo_stats_daily')->insert([
                    'day' => $day,
                    'algo' => $row->algo,
                    'kind' => $row->kind,
                    'class' => $row->class,
                    // Long-lived aggregate rows never retain a one-person raw name.
                    'name_key' => $row->users >= AlgorithmInsightsReport::MIN_USERS ? $row->name_key : null,
                    'source' => $row->source,
                    'rules_v' => $row->rules_v,
                    'events' => $row->events,
                    'users' => $row->users,
                    'corrections' => $row->corrections,
                    'sum_guess' => $row->sum_guess,
                    'sum_final' => $row->sum_final,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });

        $this->info("Rolled up {$rows->count()} group(s) for {$day}.");

        return self::SUCCESS;
    }
}
