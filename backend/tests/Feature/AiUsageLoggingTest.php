<?php

namespace Tests\Feature;

use App\Models\ApiUsageLog;
use App\Models\User;
use App\Services\AdminStats;
use App\Services\AiProviderBalance;
use App\Services\FalClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AiUsageLoggingTest extends TestCase
{
    use RefreshDatabase;

    private function openRouterSays(string $content, array $usage = ['prompt_tokens' => 120, 'completion_tokens' => 80, 'cost' => 0.00042]): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => $content]]], 'usage' => $usage], 200)]);
    }

    private function recipeReply(): string
    {
        return json_encode(['found' => true, 'name' => 'Soup', 'minutes' => 10, 'category' => 'dinner', 'ingredients' => [['name' => 'Water']], 'steps' => ['Boil.']]);
    }

    public function test_an_openrouter_call_is_logged_with_its_tokens_real_cost_feature_and_user(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->openRouterSays($this->recipeReply());

        $this->actingAs($user)->postJson('/api/recipes/ask-chef', ['prompt' => 'a quick soup'])->assertOk();

        $log = ApiUsageLog::sole();
        $this->assertSame('openrouter', $log->provider);
        $this->assertSame('Ask Chef (recipe)', $log->feature); // named from the calling service, no call site had to say so
        $this->assertSame(120, $log->prompt_tokens);
        $this->assertSame(80, $log->completion_tokens);
        $this->assertEqualsWithDelta(0.00042, $log->cost_usd, 1e-9);
        $this->assertFalse($log->cost_estimated);
        $this->assertTrue($log->ok);
        $this->assertSame($user->id, $log->user_id);
    }

    public function test_openrouter_is_asked_to_report_usage(): void
    {
        $this->openRouterSays($this->recipeReply());
        $this->actingAs(User::factory()->create(['ai_credits' => 10]))->postJson('/api/recipes/ask-chef', ['prompt' => 'a quick soup'])->assertOk();

        Http::assertSent(fn ($request) => $request['usage'] === ['include' => true]);
    }

    public function test_chat_and_the_vision_scan_are_named_after_the_feature_not_the_plumbing(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);
        $this->openRouterSays('hello');

        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef'])->assertOk();

        $this->assertContains('Quick Chat', ApiUsageLog::pluck('feature')->all());
    }

    public function test_a_failed_call_is_logged_with_its_reason_and_no_cost(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'slow down'], 429)]);
        $user = User::factory()->create(['ai_credits' => 10]);

        $this->actingAs($user)->postJson('/api/recipes/ask-chef', ['prompt' => 'a quick soup'])->assertOk();

        $log = ApiUsageLog::sole();
        $this->assertFalse($log->ok);
        $this->assertSame('rate_limited', $log->reason);
        $this->assertNull($log->cost_usd);
    }

    public function test_a_reply_without_a_reported_cost_is_logged_as_unpriced_not_free(): void
    {
        $this->openRouterSays($this->recipeReply(), ['prompt_tokens' => 10, 'completion_tokens' => 5]);
        $this->actingAs(User::factory()->create(['ai_credits' => 10]))->postJson('/api/recipes/ask-chef', ['prompt' => 'a quick soup'])->assertOk();

        $this->assertNull(ApiUsageLog::sole()->cost_usd);
        $this->assertSame(1, app(AdminStats::class)->aiUsageSummary(7)['openrouter']['unpriced']);
    }

    public function test_a_broken_log_table_never_breaks_the_ai_call(): void
    {
        $this->openRouterSays($this->recipeReply());
        Schema::drop('api_usage_logs');

        $this->actingAs(User::factory()->create(['ai_credits' => 10]))->postJson('/api/recipes/ask-chef', ['prompt' => 'a quick soup'])
            ->assertOk()->assertJsonPath('found', true);
    }

    public function test_fal_calls_are_logged_with_an_estimated_cost_from_config(): void
    {
        config(['services.fal.key' => 'fal-key', 'services.fal.cost_generate' => 0.004, 'services.fal.cost_rembg' => 0.001]);
        Http::fake([
            'fal.run/fal-ai/flux/*' => Http::response(['images' => [['url' => 'https://x/a.png']]], 200),
            'fal.run/fal-ai/imageutils/*' => Http::response(['image' => ['url' => 'https://x/b.png']], 200),
        ]);

        $fal = app(FalClient::class);
        $this->assertTrue($fal->generate('a tomato')['ok']);
        $this->assertTrue($fal->removeBackground('https://x/a.png')['ok']);

        $logs = ApiUsageLog::orderBy('id')->get();
        $this->assertSame(['Icon generation', 'Icon background removal'], $logs->pluck('feature')->all());
        $this->assertEqualsWithDelta(0.004, $logs[0]->cost_usd, 1e-9);
        $this->assertEqualsWithDelta(0.001, $logs[1]->cost_usd, 1e-9);
        $this->assertTrue($logs->every(fn ($l) => $l->provider === 'fal' && $l->cost_estimated));
    }

    public function test_a_failed_fal_call_is_logged_without_a_cost(): void
    {
        config(['services.fal.key' => 'fal-key']);
        Http::fake(['fal.run/*' => Http::response([], 500)]);

        $this->assertFalse(app(FalClient::class)->generate('a tomato')['ok']);

        $log = ApiUsageLog::sole();
        $this->assertFalse($log->ok);
        $this->assertSame('server_error', $log->reason);
        $this->assertNull($log->cost_usd);
    }

    // ---- what the dashboard reads -------------------------------------------------------------

    private function log(string $provider, string $feature, float $cost, array $over = []): ApiUsageLog
    {
        return ApiUsageLog::create($over + ['provider' => $provider, 'feature' => $feature, 'cost_usd' => $cost, 'prompt_tokens' => 100, 'completion_tokens' => 50, 'ok' => true]);
    }

    public function test_the_summary_adds_up_per_provider_and_ignores_old_calls(): void
    {
        $this->log('openrouter', 'Quick Chat', 0.10);
        $this->log('openrouter', 'Receipt scan', 0.05, ['ok' => false, 'cost_usd' => null, 'reason' => 'server_error']);
        $this->log('fal', 'Icon generation', 0.003, ['cost_estimated' => true]);
        $old = $this->log('openrouter', 'Quick Chat', 9.99);
        $old->forceFill(['created_at' => now()->subDays(20)])->save();

        $summary = app(AdminStats::class)->aiUsageSummary(7);

        $this->assertEqualsWithDelta(0.10, $summary['openrouter']['cost'], 1e-6);
        $this->assertSame(2, $summary['openrouter']['calls']);
        $this->assertSame(1, $summary['openrouter']['failed']);
        $this->assertSame(300, $summary['openrouter']['tokens']);
        $this->assertTrue($summary['fal']['estimated']);
        $this->assertFalse($summary['openrouter']['estimated']);
    }

    public function test_spend_by_day_has_every_day_even_the_quiet_ones(): void
    {
        $this->log('openrouter', 'Quick Chat', 0.20);
        $this->log('fal', 'Icon generation', 0.01);

        $byDay = app(AdminStats::class)->aiSpendByDay(7);

        $this->assertCount(7, $byDay['labels']);
        $this->assertCount(7, $byDay['openrouter']);
        $this->assertEqualsWithDelta(0.20, $byDay['openrouter'][6], 1e-6); // today is last
        $this->assertSame(0.0, $byDay['openrouter'][0]);
        $this->assertEqualsWithDelta(0.01, $byDay['fal'][6], 1e-6);
    }

    public function test_spend_by_feature_is_biggest_first_and_folds_the_tail(): void
    {
        foreach (range(1, 10) as $n) {
            $this->log('openrouter', "Feature {$n}", $n / 100);
        }

        $byFeature = app(AdminStats::class)->aiSpendByFeature(7, 3);

        $this->assertSame(['Feature 10', 'Feature 9', 'Feature 8', 'Everything else'], array_keys($byFeature));
        $this->assertEqualsWithDelta(0.28, $byFeature['Everything else'], 1e-6); // 1..7
    }

    // ---- OpenRouter's own balance ---------------------------------------------------------------

    public function test_the_balance_comes_from_credits_then_the_key_and_is_cached(): void
    {
        Cache::flush();
        config(['services.openrouter.key' => 'k']);
        Http::fake(['openrouter.ai/api/v1/credits' => Http::response(['data' => ['total_credits' => 50, 'total_usage' => 12.5]], 200)]);

        $this->assertEquals(['used' => 12.5, 'remaining' => 37.5, 'limit' => 50.0], app(AiProviderBalance::class)->openRouter());
        app(AiProviderBalance::class)->openRouter();
        Http::assertSentCount(1); // the second read came from the cache
    }

    public function test_the_balance_falls_back_to_the_keys_own_usage(): void
    {
        Cache::flush();
        config(['services.openrouter.key' => 'k']);
        Http::fake([
            'openrouter.ai/api/v1/credits' => Http::response([], 403),
            'openrouter.ai/api/v1/key' => Http::response(['data' => ['usage' => 3.2, 'limit' => null, 'limit_remaining' => null]], 200),
        ]);

        $this->assertEquals(['used' => 3.2, 'remaining' => null, 'limit' => null], app(AiProviderBalance::class)->openRouter());
    }

    public function test_no_key_or_a_failing_openrouter_means_unavailable_not_an_error(): void
    {
        Cache::flush();
        config(['services.openrouter.key' => null]);
        $this->assertNull(app(AiProviderBalance::class)->openRouter());

        Cache::flush();
        config(['services.openrouter.key' => 'k']);
        Http::fake(['openrouter.ai/*' => Http::response([], 500)]);
        $this->assertNull(app(AiProviderBalance::class)->openRouter());
    }
}
