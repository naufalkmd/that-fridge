<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\MachineRun;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MachineControllerTest extends TestCase
{
    use RefreshDatabase;

    private function fridgeFor(User $user): Fridge
    {
        return Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
    }

    private function validDraftPayload(int $fridgeId, array $overrides = []): array
    {
        return array_merge([
            'name' => 'Weekly calorie check',
            'fridge_id' => $fridgeId,
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '08:00', 'weekday' => 1]],
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories', 'expiring_within_days' => 7]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Expiring soon: {step1}']],
            ],
        ], $overrides);
    }

    // ---- draft (AI) ---------------------------------------------------------------------

    public function test_draft_spends_credits_and_returns_a_valid_draft_when_a_key_is_configured(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        $this->fridgeFor($user);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'name' => 'Weekly calorie check',
                'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '08:00']],
                'steps' => [
                    ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                    ['tool' => 'notify_user', 'args' => ['message' => 'Total: {step1}']],
                ],
            ])]]],
        ], 200)]);

        $response = $this->actingAs($user)->postJson('/api/machines/draft', ['prompt' => 'notify me about calories daily']);

        $response->assertStatus(200);
        $response->assertJson(['ok' => true]);
        $this->assertSame('Weekly calorie check', $response->json('draft.name'));
        $this->assertCount(2, $response->json('draft.steps'));
        $this->assertSame(3, $user->fresh()->ai_credits); // MACHINE_BUILD = 2
    }

    public function test_draft_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 1]); // MACHINE_BUILD costs 2
        config(['services.openrouter.key' => null]);

        $this->actingAs($user)->postJson('/api/machines/draft', ['prompt' => 'x'])
            ->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_draft_refunds_when_no_api_key_is_configured(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        config(['services.openrouter.key' => null]);
        Http::fake();

        $response = $this->actingAs($user)->postJson('/api/machines/draft', ['prompt' => 'notify me about calories']);

        $response->assertStatus(200);
        $response->assertJson(['ok' => false]);
        $this->assertNotEmpty($response->json('message'));
        $this->assertSame(5, $user->fresh()->ai_credits); // spent 2, refunded 2
        Http::assertNothingSent();
    }

    public function test_draft_refunds_when_the_model_returns_something_that_never_validates(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        config(['services.openrouter.key' => 'test-key']);
        // Always returns an empty steps array - never valid, even after the one repair round-trip.
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '{"name": "X", "trigger": {"type": "schedule", "config": {"frequency": "daily", "time": "08:00"}}, "steps": []}']]],
        ], 200)]);

        $response = $this->actingAs($user)->postJson('/api/machines/draft', ['prompt' => 'x']);

        $response->assertJson(['ok' => false]);
        $this->assertSame(5, $user->fresh()->ai_credits);
    }

    // ---- store / update / destroy (plain CRUD, re-validated server-side) ----------------

    public function test_store_saves_a_valid_draft(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);

        $response = $this->actingAs($user)->postJson('/api/machines', $this->validDraftPayload($fridge->id));

        $response->assertStatus(201);
        $this->assertDatabaseHas('machines', [
            'user_id' => $user->id,
            'fridge_id' => $fridge->id,
            'name' => 'Weekly calorie check',
            'trigger_type' => 'schedule',
            'enabled' => false,
            'version' => 1,
        ]);
    }

    public function test_store_sets_next_run_at_for_a_schedule_trigger(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);

        $response = $this->actingAs($user)->postJson('/api/machines', $this->validDraftPayload($fridge->id));

        $response->assertStatus(201);
        $this->assertNotNull($response->json('data.nextRunAt'));
    }

    public function test_store_rejects_a_step_naming_a_non_machine_eligible_tool(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);

        $response = $this->actingAs($user)->postJson('/api/machines', $this->validDraftPayload($fridge->id, [
            'steps' => [['tool' => 'remove_item', 'args' => ['item_id' => 1, 'confirm' => true]]],
        ]));

        $response->assertStatus(422);
        $this->assertDatabaseCount('machines', 0);
    }

    public function test_store_rejects_a_fridge_the_user_does_not_belong_to(): void
    {
        $user = User::factory()->create();
        $stranger = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Not Mine']);

        $response = $this->actingAs($user)->postJson('/api/machines', $this->validDraftPayload($stranger->id));

        $response->assertStatus(422);
    }

    public function test_update_can_toggle_enabled_without_resubmitting_steps(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]],
            'enabled' => false, 'version' => 1,
        ]);

        $response = $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", ['enabled' => true]);

        $response->assertStatus(200);
        $this->assertTrue($machine->fresh()->enabled);
        $this->assertSame(1, $machine->fresh()->version); // unchanged - steps weren't touched
    }

    public function test_update_bumps_version_when_steps_change(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]],
            'enabled' => false, 'version' => 1,
        ]);

        $response = $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", [
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'calories']]],
        ]);

        $response->assertStatus(200);
        $this->assertSame(2, $machine->fresh()->version);
    }

    public function test_update_resets_threshold_met_when_trigger_changes(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 2],
            'threshold_met' => true,
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);

        $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", [
            'trigger' => ['type' => 'threshold', 'config' => ['field' => 'quantity', 'op' => 'lt', 'value' => 5]],
        ])->assertStatus(200);

        $this->assertNull($machine->fresh()->threshold_met);
    }

    public function test_update_does_not_reset_threshold_met_when_only_steps_change(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 2],
            'threshold_met' => true,
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);

        $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", [
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'bye']]],
        ])->assertStatus(200);

        $this->assertTrue($machine->fresh()->threshold_met);
    }

    public function test_update_dispatches_immediately_when_enabling_an_already_met_threshold_machine(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Fridge']);
        Item::create(['section_id' => $section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1, 'location' => 'fridge']);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 2],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);

        $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", ['enabled' => true])->assertStatus(200);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
        $this->assertTrue($machine->fresh()->threshold_met);
    }

    public function test_update_recomputes_next_run_at_when_enabling_a_long_disabled_machine(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $stale = now()->subWeeks(2);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]],
            'enabled' => false, 'version' => 1, 'next_run_at' => $stale,
        ]);

        $this->actingAs($user)->patchJson("/api/machines/{$machine->id}", ['enabled' => true])->assertStatus(200);

        $this->assertTrue($machine->fresh()->next_run_at->isFuture());
    }

    public function test_update_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = $this->fridgeFor($owner);
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]],
            'enabled' => false, 'version' => 1,
        ]);

        $this->actingAs($stranger)->patchJson("/api/machines/{$machine->id}", ['enabled' => true])->assertStatus(403);
    }

    public function test_index_only_shows_the_users_own_machines(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        Machine::create([
            'user_id' => $user->id, 'fridge_id' => $this->fridgeFor($user)->id, 'name' => 'Mine',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'sum_item_field', 'args' => []]],
        ]);
        Machine::create([
            'user_id' => $other->id, 'fridge_id' => $this->fridgeFor($other)->id, 'name' => 'Not Mine',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'sum_item_field', 'args' => []]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/machines');

        $response->assertStatus(200);
        $names = collect($response->json('data'))->pluck('name');
        $this->assertContains('Mine', $names);
        $this->assertNotContains('Not Mine', $names);
    }

    // ---- run (manual "Run now") ----------------------------------------------------------

    public function test_run_executes_a_disabled_machine(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);

        $response = $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run");

        $response->assertStatus(200);
        $this->assertSame('success', $response->json('data.lastRunStatus'));
        $this->assertSame(1, $machine->fresh()->run_count);
    }

    public function test_run_returns_the_failure_reason_when_a_step_errors(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'weight', 'unit' => 'not-a-unit']]],
            'enabled' => false, 'version' => 1,
        ]);

        $response = $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run");

        $response->assertStatus(200);
        $this->assertSame('failed', $response->json('data.lastRunStatus'));
        $this->assertNotEmpty($response->json('data.lastRunError'));
    }

    public function test_run_returns_409_when_a_run_is_already_in_flight(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $lock = Cache::lock("machine-run:{$machine->id}", 300);
        $lock->get();

        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run")->assertStatus(409);

        $lock->release();
    }

    public function test_run_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $this->fridgeFor($owner)->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
        ]);

        $this->actingAs($stranger)->postJson("/api/machines/{$machine->id}/run")->assertStatus(403);
    }

    // ---- runs (execution history) --------------------------------------------------------

    public function test_runs_returns_run_history_newest_first(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $older = MachineRun::create([
            'machine_id' => $machine->id, 'machine_version' => 1, 'status' => 'success',
            'steps_run' => [['tool' => 'notify_user', 'args' => ['message' => 'hi'], 'content' => 'Notified: "hi".', 'ok' => true, 'value' => null, 'skipped' => false]],
        ]);
        $older->created_at = now()->subDay();
        $older->save();
        $newer = MachineRun::create([
            'machine_id' => $machine->id, 'machine_version' => 1, 'status' => 'failed',
            'steps_run' => [['tool' => 'notify_user', 'args' => ['message' => 'hi'], 'content' => 'Error: message is required.', 'ok' => false, 'value' => null, 'skipped' => false]],
            'error' => 'Error: message is required.',
        ]);

        $response = $this->actingAs($user)->getJson("/api/machines/{$machine->id}/runs");

        $response->assertStatus(200);
        $response->assertJsonPath('data.0.id', (string) $newer->id);
        $response->assertJsonPath('data.0.status', 'failed');
        $response->assertJsonPath('data.0.error', 'Error: message is required.');
        $response->assertJsonPath('data.0.steps.0.tool', 'notify_user');
        $response->assertJsonPath('data.0.steps.0.ok', false);
        $response->assertJsonPath('data.1.id', (string) $older->id);
        $response->assertJsonPath('data.1.status', 'success');
    }

    public function test_run_creates_a_row_visible_via_runs(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);

        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run")->assertStatus(200);
        $response = $this->actingAs($user)->getJson("/api/machines/{$machine->id}/runs");

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.status', 'success');
    }

    public function test_runs_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $this->fridgeFor($owner)->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
        ]);

        $this->actingAs($stranger)->getJson("/api/machines/{$machine->id}/runs")->assertStatus(403);
    }

    // ---- dry-run (no-write test mode) ------------------------------------------------------

    public function test_dry_run_reports_planned_actions_without_writing_anything_or_recording_a_run(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);

        $response = $this->actingAs($user)->postJson("/api/machines/{$machine->id}/dry-run");

        $response->assertStatus(200);
        $response->assertJson(['status' => 'success']);
        $this->assertStringContainsString('Would notify', $response->json('steps.0.content'));
        $this->assertDatabaseMissing('notification_events', ['fridge_id' => $fridge->id]);
        $this->assertSame(0, $machine->fresh()->run_count);
        $this->assertNull($machine->fresh()->last_run_at);

        // The dry-run/runs history split is the whole point - a preview must never show up
        // alongside real execution history.
        $runsResponse = $this->actingAs($user)->getJson("/api/machines/{$machine->id}/runs");
        $runsResponse->assertJsonCount(0, 'data');
    }

    public function test_dry_run_works_on_a_disabled_machine(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);

        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/dry-run")->assertStatus(200);
    }

    public function test_dry_run_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $this->fridgeFor($owner)->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
        ]);

        $this->actingAs($stranger)->postJson("/api/machines/{$machine->id}/dry-run")->assertStatus(403);
    }

    // ---- undo (action rollback) ------------------------------------------------------------

    public function test_undo_reverses_the_runs_undoable_steps_and_marks_it_undone(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'add_note', 'args' => ['text' => 'Restock soon']]],
            'enabled' => false, 'version' => 1,
        ]);
        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run")->assertStatus(200);
        $runId = MachineRun::where('machine_id', $machine->id)->first()->id;
        $this->assertDatabaseHas('fridge_notes', ['text' => 'Restock soon']);

        $response = $this->actingAs($user)->postJson("/api/machines/{$machine->id}/runs/{$runId}/undo");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('summaries'));
        $this->assertDatabaseMissing('fridge_notes', ['text' => 'Restock soon']);
        $this->assertNotNull(MachineRun::find($runId)->undone_at);

        $runsResponse = $this->actingAs($user)->getJson("/api/machines/{$machine->id}/runs");
        $runsResponse->assertJsonPath('data.0.undoable', false);
        $this->assertNotNull($runsResponse->json('data.0.undoneAt'));
    }

    public function test_undo_returns_409_when_already_undone(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'add_note', 'args' => ['text' => 'Restock soon']]],
            'enabled' => false, 'version' => 1,
        ]);
        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run")->assertStatus(200);
        $runId = MachineRun::where('machine_id', $machine->id)->first()->id;

        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/runs/{$runId}/undo")->assertStatus(200);
        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/runs/{$runId}/undo")->assertStatus(409);
    }

    public function test_undo_returns_422_when_the_run_has_nothing_undoable(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/run")->assertStatus(200);
        $runId = MachineRun::where('machine_id', $machine->id)->first()->id;

        $this->actingAs($user)->postJson("/api/machines/{$machine->id}/runs/{$runId}/undo")->assertStatus(422);
    }

    public function test_undo_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $fridge = $this->fridgeFor($owner);
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'add_note', 'args' => ['text' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $this->actingAs($owner)->postJson("/api/machines/{$machine->id}/run")->assertStatus(200);
        $runId = MachineRun::where('machine_id', $machine->id)->first()->id;

        $this->actingAs($stranger)->postJson("/api/machines/{$machine->id}/runs/{$runId}/undo")->assertStatus(403);
    }

    public function test_undo_404s_when_the_run_does_not_belong_to_the_machine(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machineA = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'A',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'add_note', 'args' => ['text' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $machineB = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'B',
            'trigger_type' => 'schedule', 'trigger_config' => ['frequency' => 'daily', 'time' => '08:00', 'weekday' => null, 'timezone' => 'UTC'],
            'steps' => [['tool' => 'add_note', 'args' => ['text' => 'hi']]],
            'enabled' => false, 'version' => 1,
        ]);
        $this->actingAs($user)->postJson("/api/machines/{$machineA->id}/run")->assertStatus(200);
        $runId = MachineRun::where('machine_id', $machineA->id)->first()->id;

        $this->actingAs($user)->postJson("/api/machines/{$machineB->id}/runs/{$runId}/undo")->assertStatus(404);
    }

    public function test_destroy_removes_the_machine(): void
    {
        $user = User::factory()->create();
        $fridge = $this->fridgeFor($user);
        $machine = Machine::create([
            'user_id' => $user->id, 'fridge_id' => $fridge->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'sum_item_field', 'args' => []]],
        ]);

        $this->actingAs($user)->deleteJson("/api/machines/{$machine->id}")->assertStatus(204);

        $this->assertDatabaseMissing('machines', ['id' => $machine->id]);
    }

    public function test_destroy_is_forbidden_for_another_users_machine(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $machine = Machine::create([
            'user_id' => $owner->id, 'fridge_id' => $this->fridgeFor($owner)->id, 'name' => 'X',
            'trigger_type' => 'schedule', 'trigger_config' => [], 'steps' => [['tool' => 'sum_item_field', 'args' => []]],
        ]);

        $this->actingAs($stranger)->deleteJson("/api/machines/{$machine->id}")->assertStatus(403);
        $this->assertDatabaseHas('machines', ['id' => $machine->id]);
    }
}
