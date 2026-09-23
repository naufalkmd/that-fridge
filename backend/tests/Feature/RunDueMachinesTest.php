<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Machine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class RunDueMachinesTest extends TestCase
{
    use RefreshDatabase;

    private function machine(array $overrides = []): Machine
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);

        return Machine::create(array_merge([
            'user_id' => $user->id,
            'fridge_id' => $fridge->id,
            'name' => 'X',
            'trigger_type' => 'schedule',
            'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]],
            'enabled' => true,
            'version' => 1,
            'next_run_at' => now()->subMinute(),
        ], $overrides));
    }

    public function test_queues_a_run_for_a_due_enabled_schedule_machine(): void
    {
        Queue::fake();
        $machine = $this->machine();

        $this->artisan('app:run-due-machines');

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_skips_a_machine_that_is_not_yet_due(): void
    {
        Queue::fake();
        $this->machine(['next_run_at' => now()->addHour()]);

        $this->artisan('app:run-due-machines');

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_skips_a_disabled_machine_even_if_due(): void
    {
        Queue::fake();
        $this->machine(['enabled' => false]);

        $this->artisan('app:run-due-machines');

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_skips_a_non_schedule_trigger_even_with_a_next_run_at(): void
    {
        Queue::fake();
        $this->machine(['trigger_type' => 'item_added', 'next_run_at' => now()->subMinute()]);

        $this->artisan('app:run-due-machines');

        Queue::assertNotPushed(RunMachine::class);
    }
}
