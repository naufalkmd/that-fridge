<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * ItemObserver is the entry point that decides *when* Machine dispatch happens off item
 * writes - MachineTriggerServiceTest covers the matching/edge-triggering logic itself, this
 * covers the Auth-gating asymmetry between item_added (must stay gated, to stop a Machine's
 * own write from re-triggering itself) and threshold rechecks (must NOT be gated, so one
 * Machine's write can legitimately trip a different Machine's threshold).
 */
class ItemObserverTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Fridge $fridge;

    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
        $this->section = Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function itemAddedMachine(): Machine
    {
        return Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'X',
            'trigger_type' => 'item_added', 'trigger_config' => ['search' => null, 'location' => null],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
    }

    private function thresholdMachine(): Machine
    {
        return Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'X',
            'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 2],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
    }

    public function test_creating_an_item_via_the_api_dispatches_a_matching_item_added_machine(): void
    {
        Queue::fake();
        $machine = $this->itemAddedMachine();

        $this->actingAs($this->user)->postJson("/api/sections/{$this->section->id}/items", [
            'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1,
        ])->assertStatus(201);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_creating_an_item_directly_without_auth_does_not_dispatch_item_added(): void
    {
        Queue::fake();
        $this->itemAddedMachine();

        Item::create(['section_id' => $this->section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1, 'location' => 'fridge']);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_creating_an_item_directly_without_auth_still_rechecks_thresholds(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine();

        Item::create(['section_id' => $this->section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1, 'location' => 'fridge']);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_updating_an_items_quantity_rechecks_thresholds(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine();
        $item = Item::create(['section_id' => $this->section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 5, 'location' => 'fridge']);
        Queue::fake(); // clear the creation-time push (quantity 5 doesn't meet < 2 yet)

        $item->update(['quantity' => 1]);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_renaming_an_item_does_not_recheck_thresholds(): void
    {
        Queue::fake();
        $this->thresholdMachine();
        $item = Item::create(['section_id' => $this->section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 5, 'location' => 'fridge']);
        Queue::fake();

        $item->update(['name' => 'Whole Milk']);

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_deleting_an_item_rechecks_thresholds(): void
    {
        Queue::fake();
        $machine = $this->thresholdMachine();
        $item = Item::create(['section_id' => $this->section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 5, 'location' => 'fridge']);
        Queue::fake();

        $item->delete();

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }
}
