<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserMemory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MemoryControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/memory')->assertStatus(401);
    }

    public function test_show_creates_an_empty_row_on_first_access(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/memory');

        $response->assertStatus(200);
        $response->assertJson(['facts' => []]);
    }

    public function test_show_only_returns_the_authenticated_users_own_facts(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        UserMemory::create(['user_id' => $other->id, 'facts' => ['Not yours']]);
        UserMemory::create(['user_id' => $user->id, 'facts' => ['Vegetarian']]);

        $response = $this->actingAs($user)->getJson('/api/memory');

        $response->assertJson(['facts' => ['Vegetarian']]);
    }

    public function test_extract_persists_and_returns_the_updated_facts(): void
    {
        $user = User::factory()->create();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '["Vegetarian"]']]],
        ], 200)]);

        $response = $this->actingAs($user)->postJson('/api/memory/extract', [
            'user_message' => "I'm vegetarian",
            'agent_response' => 'Got it!',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['facts' => ['Vegetarian']]);
        $this->assertDatabaseHas('user_memories', ['user_id' => $user->id]);
        $this->assertSame(['Vegetarian'], UserMemory::where('user_id', $user->id)->first()->facts);
    }

    public function test_extract_requires_both_fields(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/memory/extract', [])->assertStatus(422);
    }

    public function test_destroy_fact_removes_one_fact_by_index(): void
    {
        $user = User::factory()->create();
        UserMemory::create(['user_id' => $user->id, 'facts' => ['Vegetarian', 'Dislikes cilantro']]);

        $response = $this->actingAs($user)->deleteJson('/api/memory/facts/0');

        $response->assertStatus(200);
        $response->assertJson(['facts' => ['Dislikes cilantro']]);
    }

    public function test_destroy_fact_returns_404_for_an_out_of_range_index(): void
    {
        $user = User::factory()->create();
        UserMemory::create(['user_id' => $user->id, 'facts' => ['Vegetarian']]);

        $this->actingAs($user)->deleteJson('/api/memory/facts/5')->assertStatus(404);
    }

    public function test_destroy_clears_all_facts(): void
    {
        $user = User::factory()->create();
        UserMemory::create(['user_id' => $user->id, 'facts' => ['Vegetarian', 'Dislikes cilantro']]);

        $response = $this->actingAs($user)->deleteJson('/api/memory');

        $response->assertStatus(204);
        $this->assertSame([], UserMemory::where('user_id', $user->id)->first()->facts);
    }
}
