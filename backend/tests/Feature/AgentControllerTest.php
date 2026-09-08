<?php

namespace Tests\Feature;

use App\Models\ChatHistory;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use App\Models\UserMemory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentControllerTest extends TestCase
{
    use RefreshDatabase;

    /** No ChatHistory factory exists yet - plain inserts for the quota tests below. */
    private function seedChatHistory(User $user, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            ChatHistory::create([
                'user_id' => $user->id,
                'agent' => 'Chef',
                'user_message' => "message {$i}",
                'agent_response' => 'ok',
            ]);
        }
    }

    public function test_chat_requires_authentication(): void
    {
        $response = $this->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef']);

        $response->assertStatus(401);
    }

    public function test_chat_rejects_an_unknown_agent(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'hi',
            'agent' => 'NotARealAgent',
        ]);

        $response->assertStatus(422);
    }

    public function test_chat_persists_the_exchange_and_surfaces_the_mocked_flag(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => null]); // forces the mock path

        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'What should I cook?',
            'agent' => 'Chef',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['agent' => 'Chef', 'mocked' => true]);
        $response->assertJsonStructure(['id', 'session_id', 'user_message', 'agent_response', 'created_at', 'mocked']);

        $this->assertDatabaseHas('chat_history', [
            'user_id' => $user->id,
            'agent' => 'Chef',
            'user_message' => 'What should I cook?',
        ]);
    }

    public function test_chat_spends_a_credit_and_returns_the_new_balance(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        config(['services.openrouter.key' => null]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef']);

        $response->assertStatus(200)->assertJson(['credits' => 9]);
        $this->assertSame(9, $user->fresh()->ai_credits);
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'delta' => -1, 'reason' => 'chat']);
    }

    public function test_chat_is_rejected_with_402_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 0]);
        config(['services.openrouter.key' => null]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef']);

        $response->assertStatus(402)->assertJson(['error' => 'insufficient_credits', 'balance' => 0, 'needed' => 1]);
        $this->assertDatabaseCount('chat_history', 0);
    }

    public function test_a_tool_turn_takes_the_surcharge(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'F']);
        $item = Item::create(['section_id' => $section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1]);

        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['choices' => [['message' => ['content' => null, 'tool_calls' => [[
                'id' => 'c1', 'type' => 'function',
                'function' => ['name' => 'list_items', 'arguments' => '{}'],
            ]]]]]])
            ->push(['choices' => [['message' => ['content' => 'You have milk.']]]]),
        ]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => "what's in my fridge", 'agent' => 'Chef', 'fridge_id' => $fridge->id]);

        $response->assertStatus(200)->assertJson(['credits' => 7]); // 1 base + 2 tool surcharge
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'reason' => 'chat_tools', 'delta' => -2]);
    }

    public function test_chat_passes_the_compact_flag_through_to_the_agent_service(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => 'ok']]],
        ], 200)]);

        $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'hi',
            'agent' => 'Chef',
            'compact' => true,
        ])->assertStatus(200);

        Http::assertSent(function ($request) {
            $systemPrompt = collect($request->data()['messages'])->firstWhere('role', 'system')['content'];

            return str_contains($systemPrompt, 'ONE short, plain sentence');
        });
    }

    public function test_a_tool_call_runs_against_the_users_kitchen_and_flags_the_mutation(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Fridge']);
        $item = Item::create(['section_id' => $section->id, 'name' => 'Milk', 'icon' => 'milk', 'quantity' => 1, 'expiry_date' => now()->addDays(2)]);

        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['choices' => [['message' => [
                'content' => null,
                'tool_calls' => [[
                    'id' => 'c1',
                    'type' => 'function',
                    'function' => ['name' => 'mark_item_used', 'arguments' => json_encode(['item_id' => $item->id])],
                ]],
            ]]]])
            ->push(['choices' => [['message' => ['content' => 'Done — logged the milk.']]]]),
        ]);

        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'I used the last of the milk',
            'agent' => 'Guardian',
            'fridge_id' => $fridge->id,
        ]);

        $response->assertStatus(200)->assertJson(['mutated' => true, 'agent_response' => 'Done — logged the milk.']);
        $this->assertDatabaseMissing('items', ['id' => $item->id]);
        $this->assertDatabaseHas('usage_history', ['user_id' => $user->id, 'key' => 'milk']);
    }

    public function test_chat_rejects_a_fridge_id_the_user_is_not_a_member_of(): void
    {
        $user = User::factory()->create();
        $strangersFridge = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Not Yours']);
        config(['services.openrouter.key' => null]);

        $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'hi', 'agent' => 'Chef', 'fridge_id' => $strangersFridge->id,
        ])->assertStatus(422);
    }

    public function test_compact_calls_are_not_persisted_to_chat_history(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => null]); // forces the mock path

        // Compact calls are Home's tip-card auto-fetches, not real conversation turns -
        // persisting them would make them win the "most recent session" restore and
        // clutter the Chat History session list with entries that just come back on
        // the next page load (see AgentController::send).
        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'What should I restock?',
            'agent' => 'Shopkeeper',
            'compact' => true,
        ]);

        $response->assertStatus(200);
        $response->assertJson(['agent' => 'Shopkeeper', 'mocked' => true]);

        $this->assertDatabaseCount('chat_history', 0);
    }

    public function test_chat_reads_the_users_remembered_facts_from_the_database(): void
    {
        $user = User::factory()->create();
        UserMemory::create(['user_id' => $user->id, 'facts' => ['Vegetarian']]);
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => 'ok']]],
        ], 200)]);

        // Note: unlike inventory/usage_history, memory is never sent by the client - the
        // controller reads it straight from the DB.
        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef'])->assertStatus(200);

        Http::assertSent(function ($request) {
            $systemPrompt = collect($request->data()['messages'])->firstWhere('role', 'system')['content'];

            return str_contains($systemPrompt, 'Vegetarian');
        });
    }

    public function test_chat_reuses_the_given_session_id(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => null]);
        $sessionId = (string) Str::uuid();

        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'hi',
            'agent' => 'Chef',
            'session_id' => $sessionId,
        ]);

        $response->assertJson(['session_id' => $sessionId]);
    }

    public function test_chat_returns_a_server_error_when_the_agent_service_fails(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], 500)]);

        $response = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'hi',
            'agent' => 'Chef',
        ]);

        $response->assertStatus(500);
        $this->assertDatabaseCount('chat_history', 0);
    }

    public function test_chat_rejects_a_non_image_attachment(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/api/chat', [
            'message' => 'What is this?',
            'agent' => 'Chef',
            'image' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain'),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('image');
    }

    // Quick Chat's photo-attach button - confirms the attached image reaches the model as
    // the same multimodal `content` array shape OpenRouterVisionService already uses for
    // the fridge-photo scan flow (see AgentService::buildImageContent), not dropped on the
    // floor the way a plain-string `content` would.
    public function test_chat_sends_an_attached_image_to_the_model_as_multimodal_content(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => 'That looks like a fridge full of veggies!']]],
        ], 200)]);

        $response = $this->actingAs($user)->post('/api/chat', [
            'message' => 'What do you see in this photo?',
            'agent' => 'Chef',
            'image' => UploadedFile::fake()->image('fridge.jpg'),
        ]);

        $response->assertStatus(200);
        $response->assertJson(['agent_response' => 'That looks like a fridge full of veggies!']);

        Http::assertSent(function ($request) {
            $userTurn = collect($request->data()['messages'])->firstWhere('role', 'user');
            $content = $userTurn['content'];

            return is_array($content)
                && $content[0]['type'] === 'text'
                && $content[0]['text'] === 'What do you see in this photo?'
                && $content[1]['type'] === 'image_url'
                && str_starts_with($content[1]['image_url']['url'], 'data:image/jpeg;base64,');
        });
    }

    public function test_history_only_returns_the_authenticated_users_latest_session(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        ChatHistory::create([
            'user_id' => $otherUser->id,
            'session_id' => (string) Str::uuid(),
            'agent' => 'Chef',
            'user_message' => 'not mine',
            'agent_response' => 'nope',
        ]);

        $sessionId = (string) Str::uuid();
        ChatHistory::create([
            'user_id' => $user->id,
            'session_id' => $sessionId,
            'agent' => 'Chef',
            'user_message' => 'mine',
            'agent_response' => 'yep',
        ]);

        $response = $this->actingAs($user)->getJson('/api/chat');

        $response->assertStatus(200);
        $response->assertJson(['session_id' => $sessionId]);
        $response->assertJsonCount(1, 'messages');
    }

    public function test_suggest_item_details_requires_a_name(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/items/suggest-details', []);

        $response->assertStatus(422);
    }

    public function test_suggest_item_details_returns_shelf_life_location_and_food_group(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => null]);

        $response = $this->actingAs($user)->postJson('/api/items/suggest-details', [
            'name' => 'Frozen Peas',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['location' => 'freezer', 'nutrition_category' => 'vegetables']);
        $response->assertJsonStructure(['shelf_life_days', 'location', 'nutrition_category']);
    }

    public function test_suggest_item_details_is_rejected_when_out_of_credits(): void
    {
        $user = User::factory()->create(['ai_credits' => 0]);

        $this->actingAs($user)->postJson('/api/items/suggest-details', ['name' => 'Milk'])
            ->assertStatus(402)->assertJson(['error' => 'insufficient_credits']);
    }

    public function test_suggest_item_details_spends_a_credit(): void
    {
        $user = User::factory()->create(['ai_credits' => 3]);
        config(['services.openrouter.key' => null]);

        $this->actingAs($user)->postJson('/api/items/suggest-details', ['name' => 'Milk'])
            ->assertStatus(200);
        $this->assertSame(2, $user->fresh()->ai_credits);
    }

    public function test_delete_session_removes_only_that_session(): void
    {
        $user = User::factory()->create();
        $keep = (string) Str::uuid();
        $drop = (string) Str::uuid();
        foreach ([$keep, $drop] as $sid) {
            ChatHistory::create([
                'user_id' => $user->id, 'session_id' => $sid,
                'agent' => 'Chef', 'user_message' => 'hi', 'agent_response' => 'yo',
            ]);
        }

        $this->actingAs($user)->deleteJson("/api/chat/sessions/{$drop}")->assertOk();

        $this->assertDatabaseHas('chat_history', ['session_id' => $keep]);
        $this->assertDatabaseMissing('chat_history', ['session_id' => $drop]);
    }

    public function test_delete_all_sessions_wipes_only_the_current_users_history(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        ChatHistory::create([
            'user_id' => $user->id, 'session_id' => (string) Str::uuid(),
            'agent' => 'Chef', 'user_message' => 'mine', 'agent_response' => 'x',
        ]);
        ChatHistory::create([
            'user_id' => $other->id, 'session_id' => (string) Str::uuid(),
            'agent' => 'Chef', 'user_message' => 'theirs', 'agent_response' => 'x',
        ]);

        $this->actingAs($user)->deleteJson('/api/chat/sessions')
            ->assertOk()->assertJson(['deleted' => 1]);

        $this->assertDatabaseMissing('chat_history', ['user_message' => 'mine']);
        $this->assertDatabaseHas('chat_history', ['user_message' => 'theirs']);
    }
}
