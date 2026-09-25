<?php

namespace App\Support;

/** Every cache key the admin panel uses, in one place so tests can clear them. */
final class AdminCacheKeys
{
    public const STATS = 'admin:stats';

    public const SIGNUPS = 'admin:signups:30';

    public const CREDIT_SPEND = 'admin:credit-spend:7';

    public const ONBOARDING_FUNNEL = 'admin:funnel:14';

    public const ALGORITHM_INSIGHTS = 'admin:algorithm-insights:30';

    public const ALGORITHM_GAPS = 'admin:algorithm-gaps:180';

    public const FEEDBACK_BADGE = 'admin:badge:feedback';

    public const FAILED_JOBS_BADGE = 'admin:badge:failed-jobs';

    /** Prefix for cached filter dropdown options: admin:options:{table}.{column}. */
    public const OPTIONS_PREFIX = 'admin:options:';

    /**
     * Dashboard stale-while-revalidate window for Cache::flexible: fresh for 5 minutes, then
     * served stale (and recomputed after the response) until 30 minutes, then recomputed inline.
     */
    public const DASHBOARD_TTL = [300, 1800];

    /** Menu badge counts - short enough that a missed invalidation corrects itself quickly. */
    public const BADGE_TTL = 60;

    public const OPTIONS_TTL = 600;
}
