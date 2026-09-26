<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\ItemOutcome;
use App\Models\Machine;
use App\Models\MachineRun;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalendarControllerTest extends TestCase
{
    use RefreshDatabase;

    private function fridgeFor(User $user, string $name = 'Home'): array
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => $name]);

        return [$fridge, Section::create(['fridge_id' => $fridge->id, 'name' => 'Top'])];
    }

    private function calendar(User $user, array $query = [])
    {
        $query += ['from' => now()->subDays(3)->toDateString(), 'to' => now()->addDays(30)->toDateString()];

        return $this->actingAs($user)->getJson('/api/calendar?'.http_build_query($query));
    }

    private function machine(User $user, Fridge $fridge, array $over = []): Machine
    {
        return Machine::create(array_merge([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'Morning check',
            'trigger_type' => 'schedule',
            'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ], $over));
    }

    public function test_requires_auth_and_a_valid_short_range(): void
    {
        $this->getJson('/api/calendar?from=2026-09-01&to=2026-09-30')->assertUnauthorized();

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/calendar')->assertStatus(422);
        $this->actingAs($user)->getJson('/api/calendar?from=2026-09-10&to=2026-09-01')->assertStatus(422);
        $this->actingAs($user)->getJson('/api/calendar?from=2026-01-01&to=2026-06-30')->assertStatus(422);
        $this->actingAs($user)->getJson('/api/calendar?from=2026-09-01&to=2026-09-30&tz=Not/AZone')->assertStatus(422);
    }

    public function test_expiry_uses_the_effective_date_and_only_the_callers_fridges(): void
    {
        $me = User::factory()->create();
        $stranger = User::factory()->create();
        [, $mySection] = $this->fridgeFor($me);
        [, $theirSection] = $this->fridgeFor($stranger, 'Theirs');
        $soon = now()->addDays(5)->toDateString();

        $mySection->items()->create(['name' => 'Yogurt', 'icon' => 'yogurt', 'expiry_date' => $soon]);
        $mySection->items()->create(['name' => 'Rice', 'icon' => 'rice', 'expiry_date' => now()->addDays(400)->toDateString()]);
        $theirSection->items()->create(['name' => 'Secret', 'icon' => 'x', 'expiry_date' => $soon]);

        // Opened milk: printed date is months away but the opened estimate lands inside the range.
        $milk = $mySection->items()->create(['name' => 'Milk', 'icon' => 'milk', 'nutrition_category' => 'dairy', 'expiry_date' => now()->addMonths(3)->toDateString(), 'shelf_life_days' => 7]);
        $milk->update(['opened' => true]);
        $milk->forceFill(['opened_at' => now()->subDays(5)])->saveQuietly();

        $expiry = collect($this->calendar($me)->assertOk()->json('entries'))->where('kind', 'expiry');

        $this->assertEqualsCanonicalizing(['Yogurt', 'Milk'], $expiry->pluck('title')->all());
        $this->assertSame(now()->addDays(2)->toDateString(), $expiry->firstWhere('title', 'Milk')['date']);
        $this->assertSame($soon, $expiry->firstWhere('title', 'Yogurt')['date']);
        $this->assertSame((string) $milk->id, $expiry->firstWhere('title', 'Milk')['refs']['itemId']);
    }

    public function test_overdue_items_are_marked_and_a_fridge_filter_narrows_the_list(): void
    {
        $me = User::factory()->create();
        [$a, $sa] = $this->fridgeFor($me, 'A');
        [, $sb] = $this->fridgeFor($me, 'B');
        $sa->items()->create(['name' => 'Old', 'icon' => 'x', 'expiry_date' => now()->subDays(2)->toDateString()]);
        $sb->items()->create(['name' => 'Fresh', 'icon' => 'x', 'expiry_date' => now()->addDays(2)->toDateString()]);

        $all = collect($this->calendar($me)->json('entries'))->where('kind', 'expiry');
        $this->assertSame('overdue', $all->firstWhere('title', 'Old')['tone']);
        $this->assertNull($all->firstWhere('title', 'Fresh')['tone']);

        $only = collect($this->calendar($me, ['fridge' => $a->id])->json('entries'))->where('kind', 'expiry');
        $this->assertSame(['Old'], $only->pluck('title')->values()->all());

        $stranger = User::factory()->create();
        [$theirs] = $this->fridgeFor($stranger, 'Theirs');
        $this->calendar($me, ['fridge' => $theirs->id])->assertNotFound();
    }

    public function test_activity_is_grouped_per_day_and_limited_to_180_days(): void
    {
        $me = User::factory()->create();
        [, $section] = $this->fridgeFor($me);
        foreach (['Milk', 'Eggs', 'Rice', 'Tofu', 'Kale'] as $name) {
            $section->items()->create(['name' => $name, 'icon' => 'x']);
        }
        foreach ([['used', 0], ['used', 0], ['wasted', 0], ['used', 200]] as [$outcome, $daysAgo]) {
            $row = ItemOutcome::create([
                'user_id' => $me->id, 'original_item_id' => 1, 'outcome' => $outcome, 'confidence' => 'high',
                'predicted_days' => 1, 'actual_days' => 3,
            ]);
            $row->forceFill(['created_at' => now()->subDays($daysAgo)->subMinute()])->saveQuietly();
        }
        ItemOutcome::create(['user_id' => $me->id, 'original_item_id' => 2, 'outcome' => 'entry_mistake', 'confidence' => 'high', 'predicted_days' => 1, 'actual_days' => 0]);

        $entries = collect($this->calendar($me, ['from' => now()->subDays(60)->toDateString(), 'to' => now()->toDateString()])->assertOk()->json('entries'));

        $used = $entries->firstWhere('kind', 'used');
        $this->assertSame(2, $used['count']);
        $this->assertSame('2 items used up', $used['title']);
        $this->assertSame('1 item thrown out', $entries->firstWhere('kind', 'wasted')['title']);
        $added = $entries->firstWhere('kind', 'added');
        $this->assertSame(5, $added['count']);
        $this->assertSame('Milk, Eggs, Rice + 2 more', $added['meta']);
        $this->assertNull($entries->firstWhere('kind', 'entry_mistake'));
    }

    public function test_history_older_than_180_days_is_not_returned(): void
    {
        $me = User::factory()->create();
        $row = ItemOutcome::create(['user_id' => $me->id, 'original_item_id' => 1, 'outcome' => 'used', 'confidence' => 'high', 'predicted_days' => 1, 'actual_days' => 3]);
        $row->forceFill(['created_at' => now()->subDays(200)])->saveQuietly();

        $entries = $this->calendar($me, ['from' => now()->subDays(210)->toDateString(), 'to' => now()->subDays(190)->toDateString()])->assertOk()->json('entries');

        $this->assertSame([], $entries);
    }

    public function test_scheduled_machines_are_projected_and_runs_appear_on_their_local_day(): void
    {
        $me = User::factory()->create();
        [$fridge] = $this->fridgeFor($me);
        $daily = $this->machine($me, $fridge);
        $this->machine($me, $fridge, ['name' => 'Off one', 'enabled' => false]);
        $this->machine($me, $fridge, ['name' => 'Threshold', 'trigger_type' => 'threshold', 'trigger_config' => ['field' => 'quantity', 'op' => 'lt', 'value' => 2]]);

        $range = ['from' => now()->toDateString(), 'to' => now()->addDays(4)->toDateString()];
        $scheduled = collect($this->calendar($me, $range)->assertOk()->json('entries'))->where('kind', 'machine_scheduled');

        $this->assertGreaterThanOrEqual(4, $scheduled->count());
        $this->assertSame(['Morning check'], $scheduled->pluck('title')->unique()->values()->all());
        $this->assertSame('08:00', $scheduled->first()['time']);
        $this->assertSame((string) $daily->id, $scheduled->first()['refs']['machineId']);

        // A run at 23:30 UTC belongs to the next local day in Kuala Lumpur (UTC+8).
        $run = MachineRun::create(['machine_id' => $daily->id, 'machine_version' => 1, 'status' => 'failed', 'steps_run' => [], 'error' => 'x']);
        $at = now('UTC')->subDay()->setTime(23, 30);
        $run->forceFill(['created_at' => $at])->saveQuietly();
        $runs = collect($this->calendar($me, ['from' => $at->toDateString(), 'to' => $at->copy()->addDay()->toDateString(), 'tz' => 'Asia/Kuala_Lumpur'])->json('entries'))->where('kind', 'machine_run');

        $this->assertCount(1, $runs);
        $this->assertSame($at->copy()->addDay()->toDateString(), $runs->first()['date']);
        $this->assertSame('07:30', $runs->first()['time']);
        $this->assertSame('overdue', $runs->first()['tone']); // a failed run is flagged
    }

    public function test_other_users_machines_and_outcomes_never_leak(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        [$fridge] = $this->fridgeFor($other);
        $this->machine($other, $fridge);
        ItemOutcome::create(['user_id' => $other->id, 'original_item_id' => 1, 'outcome' => 'used', 'confidence' => 'high', 'predicted_days' => 1, 'actual_days' => 3]);

        $this->assertSame([], $this->calendar($me)->assertOk()->json('entries'));
    }
}
