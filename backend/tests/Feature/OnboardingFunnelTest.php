<?php

namespace Tests\Feature;

use App\Models\AnalyticsEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class OnboardingFunnelTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_reports_nothing_gracefully_when_there_are_no_events(): void
    {
        $this->artisan('app:onboarding-funnel')
            ->expectsOutputToContain('No analytics events')
            ->assertSuccessful();
    }

    public function test_it_counts_events_and_unique_installs_within_the_window(): void
    {
        AnalyticsEvent::create(['name' => 'onboarding_started', 'anon_id' => 'a1']);
        AnalyticsEvent::create(['name' => 'onboarding_slide_viewed', 'anon_id' => 'a1']);
        AnalyticsEvent::create(['name' => 'onboarding_slide_viewed', 'anon_id' => 'a1']);
        AnalyticsEvent::create(['name' => 'signup_completed', 'anon_id' => 'a1', 'props' => ['method' => 'email']]);
        // Outside the window — must be excluded.
        $old = AnalyticsEvent::create(['name' => 'onboarding_started', 'anon_id' => 'a2']);
        $old->forceFill(['created_at' => Carbon::now()->subDays(40)])->save();

        $this->artisan('app:onboarding-funnel --days=7')
            ->expectsOutputToContain('Onboarding started')
            ->expectsOutputToContain('email: 1')
            ->assertSuccessful();

        // 2 slide-view events, 1 unique install.
        $this->assertSame(2, AnalyticsEvent::where('name', 'onboarding_slide_viewed')->count());
    }

    public function test_it_surfaces_event_names_that_are_not_in_the_funnel_list(): void
    {
        AnalyticsEvent::create(['name' => 'brand_new_event', 'anon_id' => 'a1']);

        $this->artisan('app:onboarding-funnel')
            ->expectsOutputToContain('Other events seen: brand_new_event')
            ->assertSuccessful();
    }
}
