<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\ChatProgress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChatProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_turn_reports_its_steps_to_its_owner_only(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $progress = new ChatProgress;

        $progress->begin($user->id, 'turn-abc123');
        $this->actingAs($user)->getJson('/api/chat/progress/turn-abc123')->assertOk()->assertJson(['status' => 'Thinking']);

        $progress->step(ChatProgress::label('add_to_shopping', ['name' => 'Eggs']));
        $this->actingAs($user)->getJson('/api/chat/progress/turn-abc123')->assertJson(['status' => 'Adding eggs to your list']);
        $this->actingAs($other)->getJson('/api/chat/progress/turn-abc123')->assertJson(['status' => null]);

        $progress->end();
        $this->actingAs($user)->getJson('/api/chat/progress/turn-abc123')->assertJson(['status' => null]);
    }

    public function test_a_malformed_turn_id_is_ignored(): void
    {
        $user = User::factory()->create();
        (new ChatProgress)->begin($user->id, 'x');

        $this->actingAs($user)->getJson('/api/chat/progress/x')->assertJson(['status' => null]);
    }

    public function test_labels_name_what_the_crew_is_doing(): void
    {
        $this->assertSame('Checking your fridge', ChatProgress::label('list_items', []));
        $this->assertSame('Adding 3 items', ChatProgress::label('bulk_add_items', ['items' => [[], [], []]]));
        $this->assertSame('Adding greek yogurt', ChatProgress::label('add_item', ['name' => "  Greek\n <b>Yogurt</b> "]));
        $this->assertSame('Planning your meals', ChatProgress::label('plan_meals', []));
        $this->assertSame('Working on it', ChatProgress::label('something_new', []));
    }

    public function test_the_status_is_cleared_once_the_reply_is_sent(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'Make an omelette.']]]], 200)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $this->actingAs($user)->postJson('/api/chat', ['message' => 'What should I cook?', 'agent' => 'Chef', 'turn_id' => 'turn-xyz789'])->assertOk();

        $this->assertNull(ChatProgress::read($user->id, 'turn-xyz789'));
    }
}
