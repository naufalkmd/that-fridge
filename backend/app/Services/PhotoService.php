<?php

namespace App\Services;

use App\Support\FoodIconMatcher;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PhotoService
{
    public function __construct(protected OpenRouterVisionService $vision) {}

    /**
     * Process fridge photo and detect items via OpenRouter Vision (Claude Haiku).
     */
    public function processPhoto($file)
    {
        try {
            // Fridge photos can reveal home/location context, so unlike recipe icons/
            // attachments this goes on the private disk - signed URL only, never public.
            $disk = config('filesystems.private_media_disk');
            $path = $file->store('photos', $disk);

            // null from detectItemsWithVision means the vision call itself failed (API
            // error, exception, unparseable reply) - distinct from it succeeding with a
            // legitimately empty array (nothing identifiable in the photo). Only the
            // former should be refunded; the controller needs to tell them apart.
            $aiFailed = false;
            if (! $this->vision->available()) {
                // No API key configured at all - fall back to mock data so local dev/demoing
                // still works without anyone needing to set one up.
                $detectedItems = $this->mockDetection();
            } else {
                $detected = $this->detectItemsWithVision($file->getRealPath(), $file->getMimeType());
                if ($detected === null) {
                    $aiFailed = true;
                    $detectedItems = [];
                } else {
                    $detectedItems = $detected;
                }
            }

            return [
                'photo_scan_id' => rand(1, 100000),
                'file_path' => $path,
                'file_url' => Storage::disk($disk)->temporaryUrl($path, now()->addMinutes(30)),
                'status' => 'processed',
                'detected_items' => $detectedItems,
                'ai_failed' => $aiFailed,
            ];
        } catch (\Exception $e) {
            Log::error('Photo processing failed', ['error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Ask OpenRouter Vision (Claude Haiku) to look at the fridge photo and return detected
     * items in the same shape the frontend already expects from
     * mockDetection().
     */
    private function detectItemsWithVision(string $imagePath, string $mimeType): ?array
    {
        $prompt = <<<'PROMPT'
You are looking at a photo of the inside of a refrigerator, freezer, or pantry. Identify every distinct food or drink item visible.

Return ONLY a JSON array (no prose, no markdown fences) where each element has exactly these fields:
- "detected_name": what you actually see, in plain words, e.g. "milk bottle", "carton of eggs"
- "parsed_name": a clean, singular, human-readable product name, e.g. "Milk"
- "matched_product_id": always null
- "confidence": your confidence this item was correctly identified, from 0 to 1
- "confirmed": always false
- "condition": ONLY for loose fresh vegetables or fruit whose surface is actually visible (not
  behind sealed packaging) - your visual read of its current condition, one of "vibrant",
  "wilting", or "past_best". For everything else (packaged/sealed items, meat, dairy, drinks,
  anything not vegetable/fruit, or produce you can't get a clear look at), use null. Judge only
  what you can actually see - color, firmness, spotting, wilting - never guess from the item type.

Only include items you can actually see - do not guess at items that might typically be in a fridge but aren't visible.
If nothing identifiable is visible, return an empty array.
PROMPT;

        $result = $this->vision->analyzeImage($imagePath, $mimeType, $prompt);

        if (! is_array($result)) {
            return null;
        }

        // The model occasionally wraps the array as {"items": [...]} despite the
        // prompt; handle both shapes defensively.
        $items = $result['items'] ?? $result;

        if (! is_array($items)) {
            return null;
        }

        return array_values(array_map(function ($item) {
            $name = $item['parsed_name'] ?? 'Item';

            return [
                'detected_name' => $item['detected_name'] ?? $name,
                'parsed_name' => $name,
                'icon' => FoodIconMatcher::guess($name) ?? '',
                'matched_product_id' => null,
                'confidence' => is_numeric($item['confidence'] ?? null) ? (float) $item['confidence'] : 0.5,
                'confirmed' => false,
                'condition' => in_array($item['condition'] ?? null, ['vibrant', 'wilting', 'past_best'], true) ? $item['condition'] : null,
            ];
        }, $items));
    }

    /**
     * Fallback response used when OPENROUTER_API_KEY isn't set, or the live
     * call fails - keeps local dev/demoing possible without a key.
     */
    private function mockDetection()
    {
        $rows = [
            ['detected_name' => 'milk bottle', 'parsed_name' => 'Milk', 'confidence' => 0.95, 'condition' => null],
            ['detected_name' => 'yogurt container', 'parsed_name' => 'Yogurt', 'confidence' => 0.88, 'condition' => null],
            ['detected_name' => 'cheese package', 'parsed_name' => 'Cheese', 'confidence' => 0.82, 'condition' => null],
            ['detected_name' => 'bread loaf', 'parsed_name' => 'Bread', 'confidence' => 0.90, 'condition' => null],
            ['detected_name' => 'bag of spinach, leaves visibly wilting', 'parsed_name' => 'Spinach', 'confidence' => 0.85, 'condition' => 'wilting'],
        ];

        return array_map(fn ($r) => [
            ...$r,
            'icon' => FoodIconMatcher::guess($r['parsed_name']) ?? '',
            'matched_product_id' => null,
            'confirmed' => false,
        ], $rows);
    }
}
