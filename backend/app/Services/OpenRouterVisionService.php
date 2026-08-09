<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OpenRouterVisionService
{
    protected $apiKey;
    protected $baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    public function __construct()
    {
        $this->apiKey = env('OPENROUTER_API_KEY');
    }

    /**
     * Whether an API key is configured, i.e. whether a real vision call can be made at all.
     */
    public function available(): bool
    {
        return (bool) $this->apiKey;
    }

    /**
     * Send an image plus an instruction prompt to the vision model and return its reply
     * decoded as JSON (array or associative array, per whatever shape the prompt asked for).
     * Returns null if the key is missing, the request fails, or the reply isn't valid JSON.
     */
    public function analyzeImage(string $imagePath, string $mimeType, string $prompt): ?array
    {
        if (! $this->available()) {
            return null;
        }

        try {
            $base64 = base64_encode(file_get_contents($imagePath));
            $dataUrl = "data:{$mimeType};base64,{$base64}";

            $response = Http::withHeaders([
                'Authorization' => "Bearer {$this->apiKey}",
                'HTTP-Referer' => env('APP_URL'),
                'X-Title' => 'ThatFridge',
            ])->post($this->baseUrl, [
                'model' => 'anthropic/claude-haiku-4.5',
                'max_tokens' => 1500,
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => [
                            ['type' => 'text', 'text' => $prompt],
                            ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                        ],
                    ],
                ],
            ]);

            if (! $response->successful()) {
                Log::error('OpenRouter vision API error', ['status' => $response->status(), 'body' => $response->body()]);
                return null;
            }

            $text = $response->json('choices.0.message.content', '');
            return $this->parseModelResponse($text);
        } catch (\Exception $e) {
            Log::error('OpenRouter vision call failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Parse the model's JSON reply, tolerating markdown code fences around it.
     */
    private function parseModelResponse(string $text): ?array
    {
        $cleaned = trim($text);
        $cleaned = preg_replace('/^```(json)?/i', '', $cleaned);
        $cleaned = preg_replace('/```$/', '', $cleaned);
        $cleaned = trim($cleaned);

        $data = json_decode($cleaned, true);

        return is_array($data) ? $data : null;
    }
}
