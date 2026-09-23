<?php

namespace App\Console\Commands;

use App\Services\OnboardingFunnelReport;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

#[Signature('app:onboarding-funnel {--days=14 : Look-back window}')]
#[Description('Print the onboarding / signup funnel from analytics_events for the last N days')]
class OnboardingFunnel extends Command
{
    public function handle(OnboardingFunnelReport $report): int
    {
        $days = max(1, (int) $this->option('days'));
        $since = Carbon::now()->subDays($days);
        if (! $report->hasEvents($days)) {
            $this->warn("No analytics events in the last {$days} day(s).");

            return self::SUCCESS;
        }

        $this->info("Onboarding funnel — last {$days} day(s), since {$since->toDateTimeString()}");
        $this->newLine();

        $this->table(
            ['Step', 'Events', 'Unique installs/users'],
            array_map(fn ($row) => [$row['label'], $row['events'], $row['unique']], $report->stepCounts($days)),
        );

        // Auth method split.
        $methods = $report->authMethods($days);
        if ($methods->isNotEmpty()) {
            $this->newLine();
            $this->line('Auth methods:');
            foreach ($methods as $method => $count) {
                $this->line("  {$method}: {$count}");
            }
        }

        $other = $report->otherEventNames($days);
        if ($other->isNotEmpty()) {
            $this->newLine();
            $this->line('Other events seen: '.$other->implode(', '));
        }

        return self::SUCCESS;
    }
}
