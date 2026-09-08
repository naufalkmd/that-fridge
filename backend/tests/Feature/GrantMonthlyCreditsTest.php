<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GrantMonthlyCreditsTest extends TestCase
{
    use RefreshDatabase;

    private function grantMonthly(): void
    {
        $this->artisan('app:grant-monthly-credits', ['--month' => '2026-09'])->assertSuccessful();
    }

    public function test_free_users_are_topped_up_to_the_floor_not_stacked(): void
    {
        $low = User::factory()->create(['ai_credits' => 12]);
        $atFloor = User::factory()->create(['ai_credits' => 50]);
        $aboveFloor = User::factory()->create(['ai_credits' => 130]); // bought a pack

        $this->grantMonthly();

        $this->assertSame(50, $low->fresh()->ai_credits);
        $this->assertSame(50, $atFloor->fresh()->ai_credits);
        $this->assertSame(130, $aboveFloor->fresh()->ai_credits); // untouched
    }

    public function test_pro_users_get_the_bundle_with_the_rollover_cap(): void
    {
        $pro = User::factory()->create([
            'ai_credits' => 500,
            'pro_expires_at' => now()->addMonth(),
        ]);

        $this->grantMonthly();

        // 500 + 400 = 900, capped at pro_rollover_cap (800).
        $this->assertSame(800, $pro->fresh()->ai_credits);
    }

    public function test_a_user_still_in_their_free_trial_is_treated_as_free(): void
    {
        $trial = User::factory()->create([
            'ai_credits' => 30,
            'pro_expires_at' => now()->addDays(30),
            'pro_trial_until' => now()->addDays(4),
        ]);

        $this->grantMonthly();

        $this->assertSame(50, $trial->fresh()->ai_credits); // free top-up, not the 400 bundle
    }

    public function test_demo_accounts_are_skipped(): void
    {
        $demo = User::factory()->create(['ai_credits' => 9999, 'is_demo' => true]);

        $this->grantMonthly();

        $this->assertSame(9999, $demo->fresh()->ai_credits);
    }

    public function test_a_re_run_for_the_same_month_is_a_no_op(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);

        $this->grantMonthly();
        $this->assertSame(50, $user->fresh()->ai_credits);

        // Spend some, then re-run - the same monthly ref must not grant again.
        $user->forceFill(['ai_credits' => 20])->save();
        $this->grantMonthly();
        $this->assertSame(20, $user->fresh()->ai_credits);
    }
}
