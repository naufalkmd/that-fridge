<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Each throttled route counts in its own bucket. An unnamed 'throttle:N,M' keys by user/IP only,
 * so all of them shared one counter - a Quick Chat reply's progress polls then tripped the
 * 15/min send limit and the next message came back "Too Many Attempts.".
 */
class RouteThrottleTest extends TestCase
{
    use RefreshDatabase;

    /** Buckets meant to cover more than one route (declared on a route group). */
    private const SHARED_BUCKETS = ['auth', 'meal-entries'];

    public function test_progress_polls_do_not_use_up_the_chat_send_limit(): void
    {
        $this->actingAs(User::factory()->create());

        // ~20s of waiting on a slow reply at the app's 900ms poll interval.
        for ($i = 0; $i < 20; $i++) {
            $this->getJson('/api/chat/progress/turn-abc123')->assertOk();
        }

        // 422 = past the throttle and into validation, not a 429.
        $this->postJson('/api/chat', [])->assertStatus(422);
    }

    public function test_analytics_batches_do_not_use_up_the_login_limit(): void
    {
        for ($i = 0; $i < 7; $i++) {
            $this->postJson('/api/events', []);
        }

        $this->postJson('/api/login', [])->assertStatus(422);
    }

    public function test_every_throttled_route_names_its_own_bucket(): void
    {
        $routesByBucket = [];
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue; // vendor routes (Livewire's upload endpoint) bring their own throttles
            }
            foreach ($route->gatherMiddleware() as $middleware) {
                if (! is_string($middleware) || ! preg_match('/^throttle:\d+,\d+/', $middleware)) {
                    continue; // not a throttle, or a named limiter (throttle:register) with its own key
                }
                $args = explode(',', substr($middleware, strlen('throttle:')));
                $this->assertCount(3, $args, "{$route->uri()} throttle has no bucket name: {$middleware}");
                $routesByBucket[$args[2]][] = implode('|', $route->methods()).' '.$route->uri();
            }
        }

        $this->assertNotEmpty($routesByBucket);
        foreach ($routesByBucket as $bucket => $routes) {
            if (count($routes) > 1) {
                $this->assertContains($bucket, self::SHARED_BUCKETS, "Bucket '{$bucket}' is reused by: ".implode(', ', $routes));
            }
        }
    }
}
