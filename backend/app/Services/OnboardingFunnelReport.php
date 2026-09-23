<?php

namespace App\Services;

use App\Models\AnalyticsEvent;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/** Onboarding / signup funnel from analytics_events, shared by the command and the dashboard. */
class OnboardingFunnelReport
{
    /** Ordered funnel steps: [event name, label]. */
    public const STEPS = [
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

    public const AUTH_EVENTS = ['signup_completed', 'login_completed', 'auth_completed'];

    /**
     * Loaded into memory rather than aggregated in SQL - keeps it dialect-agnostic (sqlite in
     * tests, pg in prod) and the volume is small at this scale. Revisit with keyset
     * pagination if analytics_events ever gets large.
     *
     * @return Collection<int, AnalyticsEvent>
     */
    public function events(int $days): Collection
    {
        return AnalyticsEvent::query()
            ->where('created_at', '>=', Carbon::now()->subDays($days))
            ->get(['name', 'anon_id', 'user_id', 'props']);
    }

    /** @return list<array{label: string, events: int, unique: int}> */
    public function steps(Collection $events): array
    {
        $byName = $events->groupBy('name');
        $identity = fn (AnalyticsEvent $e) => $e->anon_id ?: 'u'.$e->user_id;

        return array_map(function ($step) use ($byName, $identity) {
            [$name, $label] = $step;
            $group = $byName->get($name) ?? collect();

            return ['label' => $label, 'events' => $group->count(), 'unique' => $group->map($identity)->unique()->count()];
        }, self::STEPS);
    }

    /** @return Collection<string, int> auth method => count */
    public function authMethods(Collection $events): Collection
    {
        return $events
            ->whereIn('name', self::AUTH_EVENTS)
            ->groupBy(fn (AnalyticsEvent $e) => $e->props['method'] ?? 'unknown')
            ->map->count();
    }

    /** Event names seen that aren't part of the funnel, so new events aren't missed. */
    public function otherEventNames(Collection $events): Collection
    {
        $known = collect(self::STEPS)->pluck(0)->merge(self::AUTH_EVENTS);

        return $events->pluck('name')->unique()->diff($known)->values();
    }
}
