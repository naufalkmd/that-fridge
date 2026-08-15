<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\WeeklyScoreSnapshot;
use App\Services\BadgeService;
use App\Services\KitchenScoreService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

#[Signature('app:snapshot-kitchen-scores')]
#[Description('Compute and store each user\'s weekly Waste Saver / Food Balance scores, independent of whether they opened the app that week - backs the streak feature')]
class SnapshotKitchenScores extends Command
{
    public function __construct(private KitchenScoreService $scores, private BadgeService $badges)
    {
        parent::__construct();
    }

    public function handle(): void
    {
        $weekOf = Carbon::now()->startOfWeek(Carbon::MONDAY)->toDateString();
        $snapshotted = 0;
        $skipped = 0;

        User::query()->chunkById(50, function ($users) use ($weekOf, &$snapshotted, &$skipped) {
            foreach ($users as $user) {
                $score = $this->scores->scoreFor($user);

                // No honest number to show yet (brand new account, nothing used up) - skip
                // rather than store a fabricated 0, same "not enough data" fallback the live
                // score card shows. A missing week already reads as a broken streak.
                if ($score['wasteScore'] === null) {
                    $skipped++;

                    continue;
                }

                WeeklyScoreSnapshot::query()->updateOrCreate(
                    ['user_id' => $user->id, 'week_of' => $weekOf],
                    [
                        'waste_score' => $score['wasteScore'],
                        'balance_score' => $score['balanceScore'],
                        'overdue_count' => $score['overdueCount'],
                    ]
                );

                if ($score['overdueCount'] === 0) {
                    $this->badges->awardProgress($user, 'zero_waste_week', 1);
                }

                $snapshotted++;
            }
        });

        $this->info("Snapshotted {$snapshotted} user(s), skipped {$skipped} with not-enough-data.");
    }
}
