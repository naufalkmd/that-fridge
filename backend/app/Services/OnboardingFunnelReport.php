<?php

namespace App\Services;

use App\Models\AnalyticsEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Onboarding / signup funnel from analytics_events, shared by the command and the dashboard.
 * Everything is aggregated in SQL - analytics_events gains a row per app open, so it's the
 * one table here that must never be pulled into PHP wholesale.
 */
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
     * One install/user identity per row: the anon id when there is one, else the user id.
     * Namespaced ('a:' / 'u:') so an anon id that happens to look like 'u123' can never merge
     * with user 123. A row with neither still counts as one shared identity ('u:'), and an
     * empty-string anon id counts as missing - both matching the original `anon_id ?: 'u'.user_id`.
     * `||` and CAST(... AS TEXT) work on both sqlite and pg.
     */
    private const IDENTITY_SQL = "case when anon_id is not null and anon_id <> '' then 'a:' || anon_id "
        ."else 'u:' || coalesce(cast(user_id as text), '') end";

    public function hasEvents(int $days): bool
    {
        return $this->since($days)->exists();
    }

    /** @return list<array{label: string, events: int, unique: int}> */
    public function stepCounts(int $days): array
    {
        $counts = $this->since($days)
            ->whereIn('name', array_column(self::STEPS, 0))
            ->groupBy('name')
            ->selectRaw('name, count(*) as events, count(distinct '.self::IDENTITY_SQL.') as uniq')
            ->get()
            ->keyBy('name');

        return array_map(function ($step) use ($counts) {
            [$name, $label] = $step;
            $row = $counts->get($name);

            return ['label' => $label, 'events' => (int) ($row->events ?? 0), 'unique' => (int) ($row->uniq ?? 0)];
        }, self::STEPS);
    }

    /**
     * Auth method split, grouped on the JSON props.method in SQL (Laravel compiles `props->method`
     * to json_extract on sqlite and ->> on pg). A missing method is reported as 'unknown'.
     *
     * @return Collection<string, int> auth method => count
     */
    public function authMethods(int $days): Collection
    {
        return $this->since($days)
            ->whereIn('name', self::AUTH_EVENTS)
            ->select('props->method as method')
            ->selectRaw('count(*) as total')
            ->groupBy('props->method')
            ->get()
            ->reduce(function (Collection $out, $row) {
                $method = $row->method ?? 'unknown';

                return $out->put($method, $out->get($method, 0) + (int) $row->total);
            }, collect());
    }

    /** Event names seen that aren't part of the funnel, so new events aren't missed. */
    public function otherEventNames(int $days): Collection
    {
        $known = array_merge(array_column(self::STEPS, 0), self::AUTH_EVENTS);

        return $this->since($days)
            ->whereNotIn('name', $known)
            ->distinct()
            ->orderBy('name')
            ->pluck('name');
    }

    /** @return Builder<AnalyticsEvent> */
    private function since(int $days): Builder
    {
        return AnalyticsEvent::query()->where('created_at', '>=', Carbon::now()->subDays($days));
    }
}
