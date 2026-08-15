<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use App\Models\WeeklyScoreSnapshot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SnapshotKitchenScoresTest extends TestCase
{
    use RefreshDatabase;

    private function itemFor(User $user, array $overrides = []): void
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
        $section->items()->create(array_merge([
            'name' => 'Milk',
            'icon' => 'milk',
            'location' => 'fridge',
            'quantity' => 1,
            'expiry_date' => now()->addDays(5)->toDateString(),
            'shelf_life_days' => 7,
        ], $overrides));
    }

    public function test_it_skips_a_user_with_no_data_rather_than_storing_a_fabricated_score(): void
    {
        User::factory()->create();

        $this->artisan('app:snapshot-kitchen-scores');

        $this->assertSame(0, WeeklyScoreSnapshot::count());
    }

    public function test_it_creates_a_snapshot_for_the_current_week_for_a_user_with_items(): void
    {
        $user = User::factory()->create();
        $this->itemFor($user);

        $this->artisan('app:snapshot-kitchen-scores');

        $weekOf = Carbon::now()->startOfWeek(Carbon::MONDAY)->toDateString();
        $this->assertDatabaseHas('weekly_score_snapshots', [
            'user_id' => $user->id,
            'week_of' => $weekOf,
            'overdue_count' => 0,
        ]);
    }

    public function test_a_second_run_the_same_week_updates_in_place_instead_of_duplicating(): void
    {
        $user = User::factory()->create();
        $this->itemFor($user);

        $this->artisan('app:snapshot-kitchen-scores');
        $this->itemFor($user, ['expiry_date' => now()->subDays(2)->toDateString(), 'shelf_life_days' => 7]);
        $this->artisan('app:snapshot-kitchen-scores');

        $this->assertSame(1, WeeklyScoreSnapshot::where('user_id', $user->id)->count());
        $this->assertDatabaseHas('weekly_score_snapshots', ['user_id' => $user->id, 'overdue_count' => 1]);
    }

    public function test_it_awards_the_zero_waste_week_badge_when_nothing_is_overdue(): void
    {
        $user = User::factory()->create();
        $this->itemFor($user);

        $this->artisan('app:snapshot-kitchen-scores');

        $this->assertDatabaseHas('user_badges', ['user_id' => $user->id, 'badge_key' => 'zero_waste_week']);
        $badge = $user->badges()->where('badge_key', 'zero_waste_week')->first();
        $this->assertNotNull($badge->earned_at);
    }

    public function test_it_does_not_award_zero_waste_week_when_something_is_overdue(): void
    {
        $user = User::factory()->create();
        $this->itemFor($user, ['expiry_date' => now()->subDays(2)->toDateString(), 'shelf_life_days' => 7]);

        $this->artisan('app:snapshot-kitchen-scores');

        $badge = $user->badges()->where('badge_key', 'zero_waste_week')->first();
        $this->assertNull($badge?->earned_at);
    }
}
