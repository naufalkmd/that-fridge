<?php

namespace Tests\Feature;

use App\Models\ChatHistory;
use App\Models\Fridge;
use App\Models\GeneratedIcon;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class StatsCommandTest extends TestCase
{
    use RefreshDatabase;

    private function statsJson(): array
    {
        Artisan::call('app:stats', ['--json' => true]);

        return json_decode(Artisan::output(), true);
    }

    public function test_it_counts_real_users_pro_and_conversion_excluding_demo_accounts(): void
    {
        User::factory()->count(3)->create();
        User::factory()->create(['pro_expires_at' => now()->addMonth()]);
        User::factory()->create(['is_demo' => true]); // not a customer

        $out = $this->statsJson();

        $this->assertSame(4, $out['users']['total']);
        $this->assertSame(1, $out['users']['pro']);
        $this->assertEquals(25.0, $out['users']['conversion_pct']);
    }

    public function test_it_counts_recent_ai_usage_and_shared_fridges(): void
    {
        $user = User::factory()->create();
        GeneratedIcon::create(['user_id' => $user->id, 'kind' => 'icon', 'credits' => 1, 'prompt' => 'p', 'image_path' => 'a', 'image_url' => 'b']);
        GeneratedIcon::create(['user_id' => $user->id, 'kind' => 'recipe', 'credits' => 1, 'prompt' => 'p', 'image_path' => 'c', 'image_url' => 'd']);
        ChatHistory::create(['user_id' => $user->id, 'agent' => 'Chef', 'user_message' => 'hi', 'agent_response' => 'hello']);

        $solo = Fridge::create(['user_id' => $user->id, 'name' => 'Mine']);
        $shared = Fridge::create(['user_id' => $user->id, 'name' => 'Ours']);
        $shared->members()->attach(User::factory()->create()->id, ['role' => 'member']);

        $out = $this->statsJson();

        $this->assertSame(2, $out['ai_last_7d']['image_generations']);
        $this->assertSame(2, $out['ai_last_7d']['credits_spent']);
        $this->assertSame(1, $out['ai_last_7d']['chat_messages']);
        $this->assertSame(1, $out['content']['shared_fridges']);
        $this->assertSame(2, $out['content']['fridges']);
    }

    public function test_it_runs_with_no_data(): void
    {
        $this->artisan('app:stats')->assertSuccessful();
    }
}
