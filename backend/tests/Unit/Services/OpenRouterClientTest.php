<?php

namespace Tests\Unit\Services;

use App\Services\OpenRouterClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OpenRouterClientTest extends TestCase
{
    public function test_available_is_false_without_an_api_key(): void
    {
        config(['services.openrouter.key' => null]);

        $this->assertFalse((new OpenRouterClient)->available());
    }

    public function test_available_is_true_with_an_api_key(): void
    {
        config(['services.openrouter.key' => 'test-key']);

        $this->assertTrue((new OpenRouterClient)->available());
    }

    public function test_complete_without_a_key_returns_no_api_key_reason_and_makes_no_request(): void
    {
        config(['services.openrouter.key' => null]);
        Http::fake();

        $result = (new OpenRouterClient)->complete([['role' => 'user', 'content' => 'hi']]);

        $this->assertSame(['ok' => false, 'reason' => 'no_api_key'], $result);
        Http::assertNothingSent();
    }

    public function test_complete_returns_the_message_content_on_success(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello there!']],
                ],
            ], 200),
        ]);

        $result = (new OpenRouterClient)->complete([['role' => 'user', 'content' => 'hi']], 500, 'anthropic/claude-haiku-4.5');

        $this->assertTrue($result['ok']);
        $this->assertSame('Hello there!', $result['content']);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
                && $request['model'] === 'anthropic/claude-haiku-4.5'
                && $request['max_tokens'] === 500
                && $request->hasHeader('Authorization', 'Bearer test-key');
        });
    }

    public static function failureStatusProvider(): array
    {
        return [
            'unauthorized' => [401, 'unauthorized'],
            'rate limited' => [429, 'rate_limited'],
            'server error' => [500, 'server_error'],
            'server error (503)' => [503, 'server_error'],
            'other client error' => [422, 'api_error'],
        ];
    }

    #[DataProvider('failureStatusProvider')]
    public function test_complete_maps_http_status_to_a_specific_failure_reason(int $status, string $expectedReason): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], $status)]);

        $result = (new OpenRouterClient)->complete([['role' => 'user', 'content' => 'hi']]);

        $this->assertFalse($result['ok']);
        $this->assertSame($expectedReason, $result['reason']);
        $this->assertSame($status, $result['status']);
    }

    public function test_complete_returns_exception_reason_when_the_request_throws(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(function () {
            throw new ConnectionException('timed out');
        });

        $result = (new OpenRouterClient)->complete([['role' => 'user', 'content' => 'hi']]);

        $this->assertSame(['ok' => false, 'reason' => 'exception'], $result);
    }
}
