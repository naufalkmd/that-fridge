<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class ExpiryScanService
{
    public function __construct(protected OpenRouterClient $client) {}

    /**
     * Read a printed expiry/best-before date out of a package photo via a vision model.
     */
    public function extractDate($file)
    {
        if (! $this->client->available()) {
            return ['found' => false, 'reason' => 'no_api_key'];
        }

        try {
            $mimeType = $file->getMimeType();
            $base64 = base64_encode(file_get_contents($file->getRealPath()));
            $dataUrl = "data:{$mimeType};base64,{$base64}";

            $prompt = <<<'PROMPT'
You are looking at a photo of a food package. Find the printed expiry / best-before / use-by date stamp.

Respond with ONLY a JSON object, no markdown fences, no extra text:
{"found": true or false, "date": "YYYY-MM-DD" or null, "raw_text": "exactly what is printed", "confidence": "high", "medium", or "low"}

If the date format is ambiguous (e.g. DD/MM vs MM/DD), use nearby words like "EXP", "BEST BEFORE", "BB", or "USE BY" and regional packaging conventions to decide, and note your reasoning briefly in raw_text.
If no date is visible or legible, set found to false and date to null.
PROMPT;

            $result = $this->client->complete([
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                    ],
                ],
            ], 300);

            if (! $result['ok']) {
                return ['found' => false, 'reason' => $result['reason']];
            }

            return $this->parseModelResponse($result['content']);
        } catch (\Exception $e) {
            Log::error('Expiry scan failed', ['error' => $e->getMessage()]);

            return ['found' => false, 'reason' => 'exception'];
        }
    }

    /**
     * Parse the model's JSON reply, tolerating markdown code fences and validating the date.
     */
    private function parseModelResponse($text)
    {
        $cleaned = trim($text);
        $cleaned = preg_replace('/^```(json)?/i', '', $cleaned);
        $cleaned = preg_replace('/```$/', '', $cleaned);
        $cleaned = trim($cleaned);

        $data = json_decode($cleaned, true);

        if (! is_array($data) || ! ($data['found'] ?? false)) {
            return ['found' => false];
        }

        $date = $data['date'] ?? null;
        if (! $date || ! \DateTime::createFromFormat('Y-m-d', $date)) {
            return ['found' => false];
        }

        return [
            'found' => true,
            'date' => $date,
            'raw_text' => $data['raw_text'] ?? null,
            'confidence' => in_array($data['confidence'] ?? null, ['high', 'medium', 'low']) ? $data['confidence'] : 'low',
        ];
    }
}
