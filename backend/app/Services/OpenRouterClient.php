<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin shared wrapper around OpenRouter's chat-completions endpoint. AgentService,
 * ExpiryScanService and OpenRouterVisionService all send the same shape of request
 * (headers, model, messages) whether the content is plain text or an image_url block,
 * so they share this instead of each rebuilding the HTTP call.
 */
class OpenRouterClient
{
    protected ?string $apiKey;

    protected string $baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    public function __construct()
    {
        $this->apiKey = config('services.openrouter.key');
    }

    public function available(): bool
    {
        return (bool) $this->apiKey;
    }

    /**
     * Run a chat completion. Returns:
     *   ['ok' => true, 'content' => string, 'tool_calls' => ?array, 'message' => array]
     * or, on failure:
     *   ['ok' => false, 'reason' => 'no_api_key'|'unauthorized'|'rate_limited'|'server_error'|'api_error'|'exception', 'status' => ?int]
     * so callers can react differently to a bad key vs. a rate limit vs. a transient
     * error instead of collapsing every failure into the same generic message.
     *
     * Pass $tools (OpenAI function-tool schema) to let the model request a tool call - the
     * raw assistant `message` and any `tool_calls` come back so the caller can run the
     * tool-use loop (see AgentService::chat). Callers that don't pass $tools can keep
     * reading just `content` as before.
     */
    public function complete(array $messages, int $maxTokens = 1000, string $model = 'anthropic/claude-haiku-4.5', array $tools = []): array
    {
        if (! $this->available()) {
            return ['ok' => false, 'reason' => 'no_api_key'];
        }

        try {
            $payload = [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'messages' => $messages,
            ];

            if ($tools) {
                $payload['tools'] = $tools;
            }

            $response = Http::withHeaders([
                'Authorization' => "Bearer {$this->apiKey}",
                'HTTP-Referer' => config('app.url'),
                'X-Title' => 'ThatFridge',
            ])->post($this->baseUrl, $payload);

            if ($response->successful()) {
                $message = $response->json('choices.0.message', []);

                return [
                    'ok' => true,
                    'content' => $message['content'] ?? '',
                    'tool_calls' => $message['tool_calls'] ?? null,
                    'message' => $message,
                ];
            }

            $reason = match (true) {
                $response->status() === 401 => 'unauthorized',
                $response->status() === 429 => 'rate_limited',
                $response->status() >= 500 => 'server_error',
                default => 'api_error',
            };

            Log::error('OpenRouter API error', ['status' => $response->status(), 'reason' => $reason, 'body' => $response->body()]);

            return ['ok' => false, 'reason' => $reason, 'status' => $response->status()];
        } catch (\Exception $e) {
            Log::error('OpenRouter request failed', ['error' => $e->getMessage()]);

            return ['ok' => false, 'reason' => 'exception'];
        }
    }
}
