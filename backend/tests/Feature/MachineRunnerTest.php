<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\MachineRun;
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

    public function test_a_step_whose_condition_is_met_runs_normally(): void
    {
        Item::create([
            'section_id' => $this->section()->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1,
            'calories' => 3000, 'location' => 'fridge',
        ]);
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                ['tool' => 'notify_user', 'args' => ['message' => 'High calories!'], 'condition' => ['step' => 1, 'op' => 'gte', 'value' => 2000]],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertFalse($run->steps_run[1]['skipped']);
        $this->assertDatabaseHas('notification_events', ['kind' => 'machine']);
    }

    public function test_a_step_whose_condition_is_not_met_is_skipped_without_error(): void
    {
        Item::create([
            'section_id' => $this->section()->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1,
            'calories' => 100, 'location' => 'fridge',
        ]);
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                ['tool' => 'notify_user', 'args' => ['message' => 'High calories!'], 'condition' => ['step' => 1, 'op' => 'gte', 'value' => 2000]],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertTrue($run->steps_run[1]['skipped']);
        $this->assertDatabaseMissing('notification_events', ['kind' => 'machine']);
    }

    public function test_a_skipped_step_does_not_abort_later_steps(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']],
                ['tool' => 'notify_user', 'args' => ['message' => 'first'], 'condition' => ['step' => 1, 'op' => 'gte', 'value' => 999]],
                ['tool' => 'notify_user', 'args' => ['message' => 'second']],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertTrue($run->steps_run[1]['skipped']);
        $this->assertFalse($run->steps_run[2]['skipped']);
        $this->assertDatabaseHas('notification_events', ['message' => 'second']);
    }

    public function test_a_skipped_steps_placeholder_falls_back_to_literal_text(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']],
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories'], 'condition' => ['step' => 1, 'op' => 'gte', 'value' => 999]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Calories: {step2}']],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertSame('Calories: {step2}', $run->steps_run[2]['args']['message']);
    }

    public function test_condition_supports_every_operator(): void
    {
        Item::create([
            'section_id' => $this->section()->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 5,
            'location' => 'fridge',
        ]);

        foreach ([['lt', 10, true], ['lte', 5, true], ['gt', 1, true], ['gte', 5, true], ['gt', 100, false]] as [$op, $value, $shouldRun]) {
            $machine = $this->machine([
                'steps' => [
                    ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']],
                    ['tool' => 'notify_user', 'args' => ['message' => 'hi'], 'condition' => ['step' => 1, 'op' => $op, 'value' => $value]],
                ],
            ]);

            $run = $this->runner->run($machine);

            $this->assertSame(! $shouldRun, $run->steps_run[1]['skipped'], "op={$op} value={$value}");
        }
    }

    public function test_mark_items_used_matching_count_can_gate_a_later_step(): void
    {
        $section = $this->section();
        Item::create(['section_id' => $section->id, 'name' => 'Yogurt', 'icon' => 'yogurt', 'quantity' => 1, 'expiry_date' => now()->addDay(), 'location' => 'fridge']);
        Item::create(['section_id' => $section->id, 'name' => 'Cream', 'icon' => 'leftovers', 'quantity' => 1, 'expiry_date' => now()->addDay(), 'location' => 'fridge']);

        $machine = $this->machine([
            'steps' => [
                ['tool' => 'mark_items_used_matching', 'args' => ['expiring_within_days' => 2]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Used up {step1} items'], 'condition' => ['step' => 1, 'op' => 'gt', 'value' => 1]],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertSame('2', $run->steps_run[0]['value']);
        $this->assertFalse($run->steps_run[1]['skipped']);
        $this->assertDatabaseMissing('items', ['name' => 'Yogurt']);
        $this->assertDatabaseMissing('items', ['name' => 'Cream']);
        $this->assertDatabaseHas('notification_events', ['message' => 'Used up 2 items']);
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

    public function test_force_executes_a_disabled_machine(): void
    {
        $machine = $this->machine(['enabled' => false]);

        $run = $this->runner->run($machine, force: true);

        $this->assertNotNull($run);
        $this->assertSame('success', $run->status);
    }

    public function test_persists_the_last_run_error_and_clears_it_on_a_later_success(): void
    {
        $machine = $this->machine([
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'weight', 'unit' => 'not-a-unit']]],
        ]);

        $this->runner->run($machine);
        $this->assertNotNull($machine->fresh()->last_run_error);

        $machine->update(['steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]]]);
        $this->runner->run($machine);

        $this->assertNull($machine->fresh()->last_run_error);
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

    // ---- execution stays AI-free (Kitchen Lab cost transparency invariant) ----------------

    /**
     * Only drafting a Machine spends AI credits (MachineController::draft) - replaying its
     * steps never should, no matter how many of the Machine-eligible tools a run exercises.
     * Regression guard for "keep Machine execution AI-free unless a future tool explicitly
     * opts into a metered model call."
     */
    public function test_running_a_machine_never_spends_ai_credits(): void
    {
        $before = $this->user->fresh()->ai_credits;
        $section = $this->section();
        Item::create(['section_id' => $section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 2, 'calories' => 100]);
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'list_items', 'args' => []],
                ['tool' => 'list_shopping', 'args' => []],
                ['tool' => 'get_kitchen_score', 'args' => []],
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                ['tool' => 'add_to_shopping', 'args' => ['name' => 'Eggs']],
                ['tool' => 'add_note', 'args' => ['text' => 'Restock soon']],
                ['tool' => 'add_item', 'args' => ['name' => 'Bread', 'shelf_life_days' => 5]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Weekly check done: {step4}']],
            ],
        ]);

        $run = $this->runner->run($machine);

        $this->assertSame('success', $run->status);
        $this->assertSame($before, $this->user->fresh()->ai_credits);
        $this->assertDatabaseMissing('ai_credit_ledger', ['user_id' => $this->user->id]);
    }

    // ---- dryRun() - no-write test mode -----------------------------------------------------

    public function test_dry_run_reports_planned_actions_without_writing_anything(): void
    {
        $item = Item::create([
            'section_id' => $this->section()->id, 'name' => 'Yogurt', 'icon' => 'yogurt',
            'quantity' => 1, 'expiry_date' => now()->addDay(),
        ]);
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'mark_items_used_matching', 'args' => ['expiring_within_days' => 2]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Used {step1} item(s)']],
            ],
        ]);

        $result = $this->runner->dryRun($machine);

        $this->assertSame('success', $result['status']);
        $this->assertNull($result['error']);
        $this->assertStringContainsString('Would mark 1 item', $result['steps'][0]['content']);
        $this->assertStringContainsString('Used 1 item(s)', $result['steps'][1]['content']);
        $this->assertStringContainsString('Would notify', $result['steps'][1]['content']);
        // The actual writes a real run would have made never happened.
        $this->assertDatabaseHas('items', ['id' => $item->id]);
        $this->assertDatabaseMissing('notification_events', ['fridge_id' => $this->fridge->id]);
    }

    public function test_dry_run_leaves_no_trace_in_run_history_or_the_machines_own_stats(): void
    {
        $machine = $this->machine();
        $countBefore = $machine->fresh()->run_count;

        $this->runner->dryRun($machine);

        $this->assertSame(0, MachineRun::where('machine_id', $machine->id)->count());
        $this->assertSame($countBefore, $machine->fresh()->run_count);
        $this->assertNull($machine->fresh()->last_run_at);
    }

    public function test_dry_run_still_honours_a_steps_condition(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']],
                [
                    'tool' => 'notify_user',
                    'args' => ['message' => 'should not fire'],
                    'condition' => ['step' => 1, 'op' => 'gt', 'value' => 999],
                ],
            ],
        ]);

        $result = $this->runner->dryRun($machine);

        $this->assertTrue($result['steps'][1]['skipped']);
        $this->assertSame('success', $result['status']);
    }

    public function test_dry_run_works_on_a_disabled_machine(): void
    {
        $machine = $this->machine(['enabled' => false, 'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]]]);

        $result = $this->runner->dryRun($machine);

        $this->assertSame('success', $result['status']);
    }

    // ---- undo() - action rollback -----------------------------------------------------------

    public function test_undo_reverses_each_undoable_step_and_reports_a_summary_per_step(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'add_note', 'args' => ['text' => 'Restock soon']],
                ['tool' => 'add_to_shopping', 'args' => ['name' => 'Butter']],
            ],
        ]);
        $run = $this->runner->run($machine);
        $this->assertDatabaseHas('fridge_notes', ['text' => 'Restock soon']);
        $this->assertDatabaseHas('shopping_items', ['name' => 'Butter']);

        $summaries = $this->runner->undo($run);

        $this->assertCount(2, $summaries);
        $this->assertDatabaseMissing('fridge_notes', ['text' => 'Restock soon']);
        $this->assertDatabaseMissing('shopping_items', ['name' => 'Butter']);
    }

    public function test_undo_skips_a_step_with_no_undo_data(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'notify_user', 'args' => ['message' => 'hi']],
                ['tool' => 'add_note', 'args' => ['text' => 'Restock soon']],
            ],
        ]);
        $run = $this->runner->run($machine);

        $summaries = $this->runner->undo($run);

        // Only add_note is undoable - notify_user contributes nothing to the summary list.
        $this->assertCount(1, $summaries);
        $this->assertDatabaseMissing('fridge_notes', ['text' => 'Restock soon']);
    }

    public function test_undo_skips_a_step_that_never_ran(): void
    {
        $machine = $this->machine([
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']],
                [
                    'tool' => 'add_note',
                    'args' => ['text' => 'should not fire'],
                    'condition' => ['step' => 1, 'op' => 'gt', 'value' => 999],
                ],
            ],
        ]);
        $run = $this->runner->run($machine);

        $summaries = $this->runner->undo($run);

        $this->assertSame([], $summaries);
    }
}
