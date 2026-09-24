<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Machine;
use App\Models\Recipe;
use App\Models\User;
use App\Services\AgentToolbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * RecipeObserver is the entry point that decides *when* recipe_made Machine dispatch happens -
 * same Auth::check() loop guard as ItemObserver's item_added handling, so a Machine's own
 * mark_recipe_made step (no web-request Auth context) can never re-trigger a recipe_made
 * Machine, while a real button-press or chat message (both authenticated) can.
 */
class RecipeObserverTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Fridge $fridge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
    }

    private function recipeMadeMachine(?int $recipeId = null, ?int $userId = null): Machine
    {
        return Machine::create([
            'user_id' => $userId ?? $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'X',
            'trigger_type' => 'recipe_made', 'trigger_config' => ['recipe_id' => $recipeId],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi']]],
            'enabled' => true, 'version' => 1,
        ]);
    }

    private function recipe(): Recipe
    {
        return Recipe::create([
            'user_id' => $this->user->id, 'name' => 'Soup', 'minutes' => 30,
            'ingredients' => [['name' => 'stock', 'icon' => 'leftovers']], 'steps' => ['Simmer'], 'made_count' => 0,
        ]);
    }

    public function test_marking_a_recipe_made_via_the_api_dispatches_a_matching_machine(): void
    {
        Queue::fake();
        $machine = $this->recipeMadeMachine();
        $recipe = $this->recipe();

        $this->actingAs($this->user)->postJson("/api/recipes/{$recipe->id}/mark-made")
            ->assertStatus(200);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_marking_a_recipe_made_via_chat_dispatches_a_matching_machine(): void
    {
        Queue::fake();
        $machine = $this->recipeMadeMachine();
        $recipe = $this->recipe();

        $this->actingAs($this->user);
        app(AgentToolbox::class)->run('mark_recipe_made', ['recipe_id' => $recipe->id], $this->user, $this->fridge->id);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_a_machines_own_mark_recipe_made_step_does_not_dispatch_another_machine(): void
    {
        Queue::fake();
        $this->recipeMadeMachine();
        $recipe = $this->recipe();

        app(AgentToolbox::class)->run('mark_recipe_made', ['recipe_id' => $recipe->id], $this->user, $this->fridge->id, 'machine');

        Queue::assertNotPushed(RunMachine::class);
    }

    public function test_a_machine_scoped_to_one_recipe_only_fires_for_that_recipe(): void
    {
        Queue::fake();
        $recipe = $this->recipe();
        $otherRecipe = $this->recipe();
        $machine = $this->recipeMadeMachine($recipe->id);

        $this->actingAs($this->user)->postJson("/api/recipes/{$otherRecipe->id}/mark-made")->assertStatus(200);
        Queue::assertNotPushed(RunMachine::class);

        $this->actingAs($this->user)->postJson("/api/recipes/{$recipe->id}/mark-made")->assertStatus(200);
        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id);
    }

    public function test_a_machine_belonging_to_a_different_user_is_never_dispatched(): void
    {
        Queue::fake();
        $otherUser = User::factory()->create();
        $this->recipeMadeMachine(userId: $otherUser->id);
        $recipe = $this->recipe();

        $this->actingAs($this->user)->postJson("/api/recipes/{$recipe->id}/mark-made")->assertStatus(200);

        Queue::assertNotPushed(RunMachine::class);
    }
}
