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
     * the reply isn't valid JSON. $model overrides OpenRouterClient's default model.
     *
     * A reply cut off at $maxTokens (a photo with a great many items) is not thrown away: the
     * complete elements before the cut are kept, so the caller gets most of the list instead of
     * nothing.
     */
    public function analyzeImage(string $imagePath, string $mimeType, string $prompt, ?string $model = null, int $maxTokens = 1500, int $timeout = 30): ?array
    {
        try {
            $contents = file_get_contents($imagePath);
            if ($contents === false) {
                Log::error('OpenRouter vision call failed', ['error' => "Could not read image at {$imagePath}"]);

                return null;
            }

            $dataUrl = 'data:'.$mimeType.';base64,'.base64_encode($contents);

            $messages = [
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                    ],
                ],
            ];
            $result = $model
                ? $this->client->complete($messages, $maxTokens, $model, timeout: $timeout)
                : $this->client->complete($messages, $maxTokens, timeout: $timeout);

            if (! $result['ok']) {
                return null;
            }

            $data = $this->parseModelResponse($result['content']);

            if ($data === null && ($result['finish_reason'] ?? null) === 'length') {
                $data = $this->recoverCutOffReply($result['content']);
                Log::warning('OpenRouter vision reply was cut off at max_tokens', ['max_tokens' => $maxTokens, 'recovered' => $data !== null]);
            }

            if ($data === null) {
                // Without this the failure is invisible: the call itself succeeded and was billed.
                Log::error('OpenRouter vision reply was not valid JSON', [
                    'finish_reason' => $result['finish_reason'] ?? null,
                    'starts' => mb_substr($result['content'], 0, 200),
                ]);
            }

            return $data;
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
        $data = json_decode($this->stripFences($text), true);

        return is_array($data) ? $data : null;
    }

    private function stripFences(string $text): string
    {
        $cleaned = trim($text);
        $cleaned = preg_replace('/^```(json)?/i', '', $cleaned);
        $cleaned = preg_replace('/```$/', '', $cleaned);

        return trim($cleaned);
    }

    /**
     * A JSON reply that stops mid-way: cut it back to the last complete element of an array and
     * close whatever is still open. `{"scene":"fridge","items":[{..},{..},{"det` becomes
     * `{"scene":"fridge","items":[{..},{..}]}`. null when there is no complete element to keep.
     */
    private function recoverCutOffReply(string $text): ?array
    {
        $text = $this->stripFences($text);
        $open = [];
        $inString = false;
        $escaped = false;
        $cut = null;
        $openAtCut = [];

        for ($i = 0, $length = strlen($text); $i < $length; $i++) {
            $char = $text[$i];

            if ($inString) {
                if ($escaped) {
                    $escaped = false;
                } elseif ($char === '\\') {
                    $escaped = true;
                } elseif ($char === '"') {
                    $inString = false;
                }

                continue;
            }

            if ($char === '"') {
                $inString = true;
            } elseif ($char === '{' || $char === '[') {
                $open[] = $char;
            } elseif ($char === '}' || $char === ']') {
                array_pop($open);
                // Just closed something that sits directly inside an array: a complete element.
                if ($open && end($open) === '[') {
                    $cut = $i + 1;
                    $openAtCut = $open;
                }
            }
        }

        if ($cut === null) {
            return null;
        }

        $closers = implode('', array_map(fn ($bracket) => $bracket === '{' ? '}' : ']', array_reverse($openAtCut)));
        $data = json_decode(substr($text, 0, $cut).$closers, true);

        return is_array($data) ? $data : null;
    }
}
