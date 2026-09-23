<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Machine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
