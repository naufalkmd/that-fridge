<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Section;
use App\Models\User;
use App\Services\MachineTriggerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MachineTriggerServiceTest extends TestCase
{
    use RefreshDatabase;

    private MachineTriggerService $service;

    private User $user;

    private Fridge $fridge;

    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(MachineTriggerService::class);
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
        $this->section = Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function item(array $attrs = []): Item
    {
        return Item::create(array_merge([
            'section_id' => $this->section->id,
            'name' => 'Milk',
            'icon' => 'milk',
            'quantity' => 1,
            'location' => 'fridge',
        ], $attrs));
    }

    private function itemAddedMachine(array $config = []): Machine
    {
        return Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'X',
            'trigger_type' => 'item_added',
            'trigger_config' => array_merge(['search' => null, 'location' => null], $config),
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
    }

    private function thresholdMachine(array $config = []): Machine
    {
        return Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'X',
            'trigger_type' => 'threshold',
            'trigger_config' => array_merge(
                ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 2],
                $config
            ),
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
    }

    // ---- itemAdded ----------------------------------------------------------------------

    public function test_item_added_dispatches_for_a_matching_machine_on_the_items_fridge(): void
    {
        Queue::fake();
        $machine = $this->itemAddedMachine();
        $item = $this->item(['name' => 'Milk']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_item_added_skips_when_search_does_not_match(): void
    {
        Queue::fake();
        $this->itemAddedMachine(['search' => 'eggs']);
        $item = $this->item(['name' => 'Milk']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_item_added_matches_search_case_insensitively(): void
    {
        Queue::fake();
        $machine = $this->itemAddedMachine(['search' => 'MILK']);
        $item = $this->item(['name' => 'Whole milk']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_item_added_skips_when_location_does_not_match(): void
    {
        Queue::fake();
        $this->itemAddedMachine(['location' => 'freezer']);
        $item = $this->item(['name' => 'Milk', 'location' => 'fridge']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_item_added_skips_a_disabled_machine(): void
    {
        Queue::fake();
        $machine = $this->itemAddedMachine();
        $machine->update(['enabled' => false]);
        $item = $this->item(['name' => 'Milk']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_item_added_skips_a_machine_on_a_different_fridge(): void
    {
        Queue::fake();
        $otherFridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Cabin']);
        Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $otherFridge->id, 'name' => 'X',
            'trigger_type' => 'item_added', 'trigger_config' => ['search' => null, 'location' => null],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
        $item = $this->item(['name' => 'Milk']);

        $this->service->itemAdded($item, $this->fridge);

        Queue::assertNotPushed(RunMachine::class);
    }

    // ---- recheckThresholds ---------------------------------------------------------------

    public function test_recheck_thresholds_dispatches_once_on_the_not_met_to_met_transition(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine(['op' => 'lt', 'value' => 2]); // quantity < 2
        $this->item(['quantity' => 1]);

        $this->service->recheckThresholds($this->fridge);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
        $this->assertTrue($machine->fresh()->threshold_met);
    }

    public function test_recheck_thresholds_does_not_refire_while_still_met(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine(['op' => 'lt', 'value' => 2]);
        $this->item(['quantity' => 1]);

        $this->service->recheckThresholds($this->fridge);
        Queue::fake(); // reset the recorded pushes
        $this->service->recheckThresholds($this->fridge);

        Queue::assertNotPushed(RunMachine::class);
        $this->assertTrue($machine->fresh()->threshold_met);
    }

    public function test_recheck_thresholds_rearms_after_dropping_back_below(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine(['op' => 'lt', 'value' => 2]);
        $item = $this->item(['quantity' => 1]);
        $this->service->recheckThresholds($this->fridge); // fires, quantity(1) < 2

        $item->update(['quantity' => 5]);
        $this->service->recheckThresholds($this->fridge); // 5 is not < 2 - rearms
        $this->assertFalse($machine->fresh()->threshold_met);

        Queue::fake();
        $item->update(['quantity' => 1]);
        $this->service->recheckThresholds($this->fridge); // 1 < 2 again - fires again

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_recheck_thresholds_forces_the_machines_own_fridge_id_ignoring_the_filters_fridge_id(): void
    {
        Queue::fake();
        $otherFridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Cabin']);
        $machine = $this->thresholdMachine(['op' => 'lt', 'value' => 2, 'filter' => ['fridge_id' => $otherFridge->id]]);
        $this->item(['quantity' => 1]);

        $this->service->recheckThresholds($this->fridge);

        // Despite filter naming a different fridge, the machine's own fridge (with the
        // matching item) is what gets evaluated.
        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_recheck_thresholds_skips_a_disabled_machine(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine(['op' => 'lt', 'value' => 2]);
        $machine->update(['enabled' => false]);
        $this->item(['quantity' => 1]);

        $this->service->recheckThresholds($this->fridge);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_recheck_thresholds_supports_every_operator(): void
    {
        Queue::fake();
        $this->item(['quantity' => 5]);

        $lt = $this->thresholdMachine(['op' => 'lt', 'value' => 10]);
        $lte = $this->thresholdMachine(['op' => 'lte', 'value' => 5]);
        $gt = $this->thresholdMachine(['op' => 'gt', 'value' => 1]);
        $gte = $this->thresholdMachine(['op' => 'gte', 'value' => 5]);
        $notMet = $this->thresholdMachine(['op' => 'gt', 'value' => 100]);

        $this->service->recheckThresholds($this->fridge);

        foreach ([$lt, $lte, $gt, $gte] as $machine) {
            Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
        }
        Queue::assertNotPushed(RunMachine::class, fn ($job) => $job->machineId === $notMet->id);
    }
}
