<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AskChefRecipeTest extends TestCase
{
    use RefreshDatabase;

    private function modelSays(array|string $reply): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => is_array($reply) ? json_encode($reply) : $reply]]],
        ], 200)]);
    }

    private function ask(User $user, array $body = [])
    {
        return $this->actingAs($user)->postJson('/api/recipes/ask-chef', $body + ['prompt' => 'a quick vegetarian dinner']);
    }

    private function recipeReply(array $over = []): array
    {
        return $over + [
            'found' => true, 'name' => 'Spinach omelette', 'minutes' => 15, 'category' => 'dinner',
            'ingredients' => [['name' => 'Eggs'], ['name' => 'Spinach']], 'steps' => ['Whisk eggs.', 'Cook with spinach.'],
        ];
    }

    public function test_it_drafts_a_recipe_charges_credits_and_saves_nothing(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->modelSays($this->recipeReply());

        $res = $this->ask($user)->assertOk();

        $res->assertJsonPath('found', true)->assertJsonPath('recipe.name', 'Spinach omelette')
            ->assertJsonPath('recipe.minutes', 15)->assertJsonPath('recipe.ingredients.0.name', 'Eggs')
            ->assertJsonPath('creditsUsed', 2)->assertJsonPath('balance', 8);
        $this->assertSame(0, Recipe::count());
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'delta' => -2, 'reason' => 'recipe_chef']);
    }

    public function test_what_the_user_typed_reaches_the_model_as_data(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->modelSays($this->recipeReply());

        $this->ask($user, ['prompt' => 'high-protein dinner under 30 minutes'])->assertOk();

        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'], '<<<REQUEST>>>')
            && str_contains($r['messages'][0]['content'], 'high-protein dinner under 30 minutes'));
    }

    public function test_use_fridge_adds_what_is_expiring_to_the_prompt(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Fridge']);
        Item::create(['section_id' => $section->id, 'name' => 'Spinach', 'icon' => 'leaf', 'quantity' => 1, 'location' => 'fridge', 'expiry_date' => now()->addDay()]);
        $this->modelSays($this->recipeReply());

        $this->ask($user, ['use_fridge' => true])->assertOk();
        Http::assertSent(fn ($r) => str_contains($r['messages'][0]['content'], 'Spinach (expires in 1d)'));

        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => json_encode($this->recipeReply())]]]], 200)]);
        $this->ask($user)->assertOk(); // not asked to use the fridge
        Http::assertSent(fn ($r) => ! str_contains($r['messages'][0]['content'], 'Spinach (expires'));
    }

    public function test_a_reply_that_is_not_a_recipe_is_refunded(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->modelSays(['found' => false]);

        $this->ask($user, ['prompt' => 'what is the capital of France'])->assertOk()
            ->assertJsonPath('found', false)->assertJsonPath('creditsUsed', 0)->assertJsonPath('balance', 10);

        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'reason' => 'recipe_chef_refund']);
    }

    public function test_garbage_from_the_model_is_refunded_too(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->modelSays('sorry I cannot');

        $this->ask($user)->assertOk()->assertJsonPath('found', false)->assertJsonPath('balance', 10);
    }

    public function test_without_an_ai_key_nothing_is_charged(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        config(['services.openrouter.key' => null]);

        $this->ask($user)->assertOk()->assertJsonPath('found', false)->assertJsonPath('reason', 'no_api_key')->assertJsonPath('balance', 10);
    }

    public function test_without_enough_credits_it_answers_402(): void
    {
        $user = User::factory()->create(['ai_credits' => 1]);
        $this->modelSays($this->recipeReply());

        $this->ask($user)->assertStatus(402);
    }

    public function test_validation_and_auth(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);

        $this->ask($user, ['prompt' => ''])->assertStatus(422);
        $this->ask($user, ['prompt' => str_repeat('x', 401)])->assertStatus(422);
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/recipes/ask-chef', ['prompt' => 'soup'])->assertStatus(401);
    }
}
