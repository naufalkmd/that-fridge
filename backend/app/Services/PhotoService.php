<?php

namespace App\Services;

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
            // Save file to storage
            $path = $file->store('photos', 'public');

            if (! $this->vision->available()) {
                // No API key configured at all - fall back to mock data so local dev/demoing
                // still works without anyone needing to set one up.
                $detectedItems = $this->mockDetection();
            } else {
                // A key is configured, so a real call was attempted. If it failed or nothing
                // identifiable was in the photo, return an empty result rather than fake data -
                // the frontend already shows a proper "couldn't spot any items" message for
                // this case, which is honest instead of silently wrong.
                $detectedItems = $this->detectItemsWithVision($file->getRealPath(), $file->getMimeType()) ?? [];
            }

            return [
                'photo_scan_id' => rand(1, 100000),
                'file_path' => $path,
                'file_url' => Storage::url($path),
                'status' => 'processed',
                'detected_items' => $detectedItems,
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
- "icon": one lowercase category word for icon lookup, one of: milk, cheese, egg, bread, meat, fish, vegetable, fruit, drink, snack, item
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

        return array_values(array_map(fn ($item) => [
            'detected_name' => $item['detected_name'] ?? ($item['parsed_name'] ?? 'item'),
            'parsed_name' => $item['parsed_name'] ?? 'Item',
            'icon' => $item['icon'] ?? 'item',
            'matched_product_id' => null,
            'confidence' => is_numeric($item['confidence'] ?? null) ? (float) $item['confidence'] : 0.5,
            'confirmed' => false,
            'condition' => in_array($item['condition'] ?? null, ['vibrant', 'wilting', 'past_best'], true) ? $item['condition'] : null,
        ], $items));
    }

    /**
     * Fallback response used when OPENROUTER_API_KEY isn't set, or the live
     * call fails - keeps local dev/demoing possible without a key.
     */
    private function mockDetection()
    {
        return [
            [
                'detected_name' => 'milk bottle',
                'parsed_name' => 'Milk',
                'icon' => 'milk',
                'matched_product_id' => null,
                'confidence' => 0.95,
                'confirmed' => false,
                'condition' => null,
            ],
            [
                'detected_name' => 'yogurt container',
                'parsed_name' => 'Yogurt',
                'icon' => 'yogurt',
                'matched_product_id' => null,
                'confidence' => 0.88,
                'confirmed' => false,
                'condition' => null,
            ],
            [
                'detected_name' => 'cheese package',
                'parsed_name' => 'Cheese',
                'icon' => 'cheese',
                'matched_product_id' => null,
                'confidence' => 0.82,
                'confirmed' => false,
                'condition' => null,
            ],
            [
                'detected_name' => 'bread loaf',
                'parsed_name' => 'Bread',
                'icon' => 'bread',
                'matched_product_id' => null,
                'confidence' => 0.90,
                'confirmed' => false,
                'condition' => null,
            ],
            [
                'detected_name' => 'bag of spinach, leaves visibly wilting',
                'parsed_name' => 'Spinach',
                'icon' => 'vegetable',
                'matched_product_id' => null,
                'confidence' => 0.85,
                'confirmed' => false,
                'condition' => 'wilting',
            ],
        ];
    }

    /**
     * Confirm and prepare detected items for import
     */
    public function confirmItems($items)
    {
        return collect($items)
            ->filter(fn ($item) => $item['confirmed'] ?? false)
            ->map(function ($item) {
                return [
                    'name' => $item['name'] ?? $item['parsed_name'],
                    'icon' => $item['icon'] ?? 'item',
                    'location' => $item['location'] ?? 'fridge',
                    'quantity' => $item['quantity'] ?? 1,
                    'expiry_date' => $item['expiry_date'] ?? now()->addDays(14)->toDateString(),
                    'shelf_life_days' => $item['shelf_life_days'] ?? 14,
                    'source' => 'photo',
                ];
            })
            ->toArray();
    }
}