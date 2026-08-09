<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class OpenRouterVisionService
{
    public function __construct(protected OpenRouterClient $client) {}

    /**
     * Whether an API key is configured, i.e. whether a real vision call can be made at all.
     */
    public function available(): bool
    {
        return $this->client->available();
    }

    /**
     * Send an image plus an instruction prompt to the vision model and return its reply
     * decoded as JSON (array or associative array, per whatever shape the prompt asked for).
     * Returns null if the key is missing, the image can't be read, the request fails, or
     * the reply isn't valid JSON.
     */
    public function analyzeImage(string $imagePath, string $mimeType, string $prompt): ?array
    {
        try {
            $contents = file_get_contents($imagePath);
            if ($contents === false) {
                Log::error('OpenRouter vision call failed', ['error' => "Could not read image at {$imagePath}"]);

                return null;
            }

            $dataUrl = 'data:'.$mimeType.';base64,'.base64_encode($contents);

            $result = $this->client->complete([
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                    ],
                ],
            ], 1500);

            if (! $result['ok']) {
                return null;
            }

            return $this->parseModelResponse($result['content']);
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
