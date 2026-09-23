<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Section;
use App\Models\User;
use App\Services\MachineRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class MachineRunnerTest extends TestCase
{
    use RefreshDatabase;

    private MachineRunner $runner;

    private User $user;

    private Fridge $fridge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->runner = app(MachineRunner::class);
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
    }

    private function section(): Section
    {
        return Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function machine(array $overrides = []): Machine
    {
        return Machine::create(array_merge([
            'user_id' => $this->user->id,
            'fridge_id' => $this->fridge->id,
            'name' => 'Weekly calorie check',
            'trigger_type' => 'schedule',
            'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                ['tool' => 'notify_user', 'args' => ['message' => 'Total calories: {step1}']],
            ],
            'enabled' => true,
            'version' => 1,
        ], $overrides));
    }

    public function test_runs_every_step_and_resolves_placeholders_from_the_prior_steps_value(): void
    {
        Item::create([
            'section_id' => $this->section()->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1,
            'calories' => 150, 'location' => 'fridge',
        ]);
        $machine = $this->machine();

        $run = $this->runner->run($machine);

        $this->assertNotNull($run);
        $this->assertSame('success', $run->status);
        $this->assertCount(2, $run->steps_run);
        $this->assertSame('150 kcal', $run->steps_run[0]['value']);
        $this->assertStringContainsString('Total calories: 150 kcal', $run->steps_run[1]['args']['message']);
        $this->assertDatabaseHas('notification_events', ['kind' => 'machine', 'user_id' => $this->user->id]);
    }

    public function test_updates_the_machines_run_bookkeeping_and_advances_next_run_at(): void
    {
        $machine = $this->machine(['next_run_at' => now()->subMinute()]);

        $this->runner->run($machine);
        $machine->refresh();

        $this->assertSame(1, $machine->run_count);
        $this->assertSame('success', $machine->last_run_status);
        $this->assertNotNull($machine->last_run_at);
        $this->assertTrue($machine->next_run_at->isFuture());
    }

    public function test_stops_at_the_first_failing_step_and_does_not_run_the_rest(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'weight', 'unit' => 'not-a-unit']],
                ['tool' => 'notify_user', 'args' => ['message' => 'should not run']],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('failed', $run->status);
        $this->assertCount(1, $run->steps_run);
        $this->assertNotNull($run->error);
        $this->assertDatabaseMissing('notification_events', ['kind' => 'machine']);
    }

    public function test_records_which_machine_version_actually_ran(): void
    {
        $machine = $this->machine(['version' => 3]);

        $run = $this->runner->run($machine);

        $this->assertSame(3, $run->machine_version);
    }

    public function test_does_nothing_for_a_disabled_machine(): void
    {
        $machine = $this->machine(['enabled' => false]);

        $run = $this->runner->run($machine);

        $this->assertNull($run);
        $this->assertDatabaseCount('machine_runs', 0);
    }

    public function test_a_second_concurrent_run_is_skipped_while_the_first_holds_the_lock(): void
    {
        $machine = $this->machine();
        $lock = Cache::lock("machine-run:{$machine->id}", 300);
        $lock->get();

        $run = $this->runner->run($machine);

        $this->assertNull($run);
        $lock->release();
    }

    public function test_notify_user_targets_the_machines_fridge_regardless_of_the_users_other_fridges(): void
    {
        $otherFridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Cabin']);
        $machine = $this->machine([
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
        ]);

        $this->runner->run($machine);

        $this->assertDatabaseHas('notification_events', ['fridge_id' => $this->fridge->id, 'kind' => 'machine']);
        $this->assertDatabaseMissing('notification_events', ['fridge_id' => $otherFridge->id, 'kind' => 'machine']);
    }
}
