<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class NutritionLabelService
{
    // Reuses the same entity-agnostic vision service PhotoService already uses for fridge-
    // photo item detection - one vision client, many prompts - rather than talking to
    // OpenRouterClient directly the way the older ExpiryScanService does.
    public function __construct(protected OpenRouterVisionService $vision) {}

    /**
     * Read the calorie figure off a nutrition-label photo.
     *
     * @return array{found: bool, calories?: int, serving_size?: ?string, confidence?: string, reason?: string}
     */
    public function extractCalories($file): array
    {
        // Checked before calling analyzeImage() because that method returns null for both
        // "no key configured" and "the call itself failed" - the caller (CalorieController)
        // needs to tell those apart to decide whether a credit refund is owed.
        if (! $this->vision->available()) {
            return ['found' => false, 'reason' => 'no_api_key'];
        }

        try {
            $prompt = <<<'PROMPT'
You are looking at a photo of a nutrition/nutrition-facts label on food packaging. Find the energy/calorie figure.

Respond with ONLY a JSON object, no markdown fences, no extra text:
{"found": true or false, "calories": integer or null, "serving_size": "exactly what the label says the serving is, e.g. 'per 100g' or 'per serving (30g)'" or null, "confidence": "high", "medium", or "low"}

Report calories in kcal - if only kJ is printed, divide by 4.184 and round to the nearest whole number.
If the label gives both a per-serving and a per-100g figure, report the per-serving figure and say so in serving_size.
If no calorie figure is legible, set found to false.
PROMPT;

            $result = $this->vision->analyzeImage($file->getRealPath(), $file->getMimeType(), $prompt);

            if (! is_array($result)) {
                return ['found' => false, 'reason' => 'call_failed'];
            }

            return $this->parseResult($result);
        } catch (\Exception $e) {
            Log::error('Nutrition label scan failed', ['error' => $e->getMessage()]);

            return ['found' => false, 'reason' => 'call_failed'];
        }
    }

    /**
     * No `reason` key on a "not found" result here (unlike the two branches above) means a
     * real vision call ran and legitimately found no legible calorie figure - not refundable,
     * same distinction ExpiryScanController draws for its own scan.
     */
    private function parseResult(array $data): array
    {
        $calories = $data['calories'] ?? null;

        if (! ($data['found'] ?? false) || ! is_numeric($calories)) {
            return ['found' => false];
        }

        $calories = max(0, min(100000, (int) $calories));

        return [
            'found' => true,
            'calories' => $calories,
            'serving_size' => is_string($data['serving_size'] ?? null) ? mb_substr($data['serving_size'], 0, 120) : null,
            'confidence' => in_array($data['confidence'] ?? null, ['high', 'medium', 'low'], true) ? $data['confidence'] : 'low',
        ];
    }
}
