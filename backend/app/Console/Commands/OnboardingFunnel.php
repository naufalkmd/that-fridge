<?php

namespace App\Console\Commands;

use App\Models\AnalyticsEvent;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

#[Signature('app:onboarding-funnel {--days=14 : Look-back window}')]
#[Description('Print the onboarding / signup funnel from analytics_events for the last N days')]
class OnboardingFunnel extends Command
{
    /** Ordered funnel steps: [event name, label]. */
    private const STEPS = [
        ['app_open', 'App opened'],
        ['onboarding_started', 'Onboarding started'],
        ['onboarding_slide_viewed', 'Slide viewed (any)'],
        ['onboarding_fridge_step_viewed', 'Reached "name your fridge"'],
        ['onboarding_fridge_created', '  ...named a fridge'],
        ['onboarding_fridge_skipped', '  ...skipped naming'],
        ['onboarding_finished', 'Onboarding finished'],
        ['onboarding_skipped', 'Onboarding skipped'],
        ['signup_completed', 'Signup (email)'],
        ['auth_completed', 'Signup/login (social)'],
        ['login_completed', 'Login (email)'],
        ['onboarding_hydrated', 'Draft hydrated (Phase 3+)'],
    ];

    private const AUTH_EVENTS = ['signup_completed', 'login_completed', 'auth_completed'];

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $since = Carbon::now()->subDays($days);

        // Loaded into memory rather than aggregated in SQL — keeps it dialect-agnostic
        // (sqlite in tests, pg in prod) and the volume is small at this scale. Revisit
        // with keyset pagination if analytics_events ever gets large.
        $events = AnalyticsEvent::query()
            ->where('created_at', '>=', $since)
            ->get(['name', 'anon_id', 'user_id', 'props']);

        if ($events->isEmpty()) {
            $this->warn("No analytics events in the last {$days} day(s).");

            return self::SUCCESS;
        }

        $byName = $events->groupBy('name');
        $identity = fn (AnalyticsEvent $e) => $e->anon_id ?: 'u'.$e->user_id;

        $this->info("Onboarding funnel — last {$days} day(s), since {$since->toDateTimeString()}");
        $this->newLine();

        $rows = [];
        foreach (self::STEPS as [$name, $label]) {
            $group = $byName->get($name) ?? collect();
            $rows[] = [$label, $group->count(), $group->map($identity)->unique()->count()];
        }
        $this->table(['Step', 'Events', 'Unique installs/users'], $rows);

        // Auth method split.
        $methods = $events
            ->whereIn('name', self::AUTH_EVENTS)
            ->groupBy(fn (AnalyticsEvent $e) => $e->props['method'] ?? 'unknown')
            ->map->count();
        if ($methods->isNotEmpty()) {
            $this->newLine();
            $this->line('Auth methods:');
            foreach ($methods as $method => $count) {
                $this->line("  {$method}: {$count}");
            }
        }

        // Surface any event name not in the funnel list, so new events aren't missed.
        $known = collect(self::STEPS)->pluck(0)->merge(self::AUTH_EVENTS);
        $other = $byName->keys()->diff($known);
        if ($other->isNotEmpty()) {
            $this->newLine();
            $this->line('Other events seen: '.$other->implode(', '));
        }

        return self::SUCCESS;
    }
}
