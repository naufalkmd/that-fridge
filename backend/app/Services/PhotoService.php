<?php

namespace App\Services;

use App\Support\FoodIconMatcher;
use App\Support\UprightImage;
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
            $scene = null;
            if (! $this->vision->available()) {
                // No API key configured at all - fall back to mock data so local dev/demoing
                // still works without anyone needing to set one up.
                $detectedItems = $this->mockDetection();
                $scene = 'fridge';
            } else {
                // Boxes come back in the model's view of the pixels, so it must see the
                // photo the same way up as the phone shows it.
                $upright = UprightImage::copy($file->getRealPath(), $file->getMimeType());
                try {
                    $detected = $this->detectItemsWithVision($upright ?? $file->getRealPath(), $upright ? 'image/jpeg' : $file->getMimeType());
                } finally {
                    if ($upright) {
                        @unlink($upright);
                    }
                }
                if ($detected === null) {
                    $aiFailed = true;
                    $detectedItems = [];
                } else {
                    $detectedItems = $detected['items'];
                    $scene = $detected['scene'];
                }
            }

            return [
                'photo_scan_id' => rand(1, 100000),
                'file_path' => $path,
                'file_url' => Storage::disk($disk)->temporaryUrl($path, now()->addMinutes(30)),
                'status' => 'processed',
                'detected_items' => $detectedItems,
                'scene' => $scene,
                'ai_failed' => $aiFailed,
            ];
        } catch (\Exception $e) {
            Log::error('Photo processing failed', ['error' => $e->getMessage()]);

            return null;
        }
    }

    /** What a photo can show; `counter` is groceries laid out, not yet put away. */
    public const SCENES = ['fridge', 'freezer', 'pantry', 'counter', 'unclear'];

    public const STORAGE = ['fridge', 'freezer', 'pantry'];

    /**
     * Ask OpenRouter Vision to look at the photo and return ['scene' => ?string, 'items' => [...]],
     * items in the same shape as mockDetection(). null when the call itself failed.
     */
    private function detectItemsWithVision(string $imagePath, string $mimeType): ?array
    {
        $prompt = <<<'PROMPT'
You are looking at a photo from someone's kitchen: usually the inside of a refrigerator, freezer, pantry or cupboard, or groceries laid out on a counter. Identify every distinct food or drink item visible.

Return ONLY a JSON object (no prose, no markdown fences) with two fields:
- "scene": what the photo shows, one of "fridge", "freezer", "pantry" (a pantry, cupboard or shelf
  of dry goods), "counter" (groceries laid out, not yet put away) or "unclear".
- "items": an array where each element has exactly these fields:
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
- "box": where the item is in the photo, as [ymin, xmin, ymax, xmax] with each value an integer
  from 0 to 1000 (0,0 is the top-left corner, 1000,1000 the bottom-right). Draw it tightly around
  that one item. Use null only if you can't place it.
- "storage": where this item is normally kept once put away, one of "fridge", "freezer" or "pantry".

If you see several of the same item (e.g. three yogurt pots), list each one as its own element.

Only include items you can actually see - do not guess at items that might typically be in a fridge but aren't visible.
If nothing identifiable is visible, return an empty "items" array.
PROMPT;

        // Boxes make the reply longer, hence more room than the 1500-token default.
        $model = config('services.openrouter.photo_scan_model') ?: 'anthropic/claude-haiku-4.5';
        $result = $this->vision->analyzeImage($imagePath, $mimeType, $prompt, $model, 3000);

        if (! is_array($result)) {
            return null;
        }

        // Asked for {"scene", "items"}, but a bare array (the older shape) is accepted too.
        $items = $result['items'] ?? (array_is_list($result) ? $result : null);
        if (! is_array($items)) {
            return null;
        }
        $scene = is_string($result['scene'] ?? null) && in_array($result['scene'], self::SCENES, true) ? $result['scene'] : null;

        return ['scene' => $scene, 'items' => array_values(array_map(function ($item) {
            $name = $item['parsed_name'] ?? 'Item';

            return [
                'detected_name' => $item['detected_name'] ?? $name,
                'parsed_name' => $name,
                'icon' => FoodIconMatcher::guess($name) ?? '',
                'matched_product_id' => null,
                'confidence' => is_numeric($item['confidence'] ?? null) ? (float) $item['confidence'] : 0.5,
                'confirmed' => false,
                'condition' => in_array($item['condition'] ?? null, ['vibrant', 'wilting', 'past_best'], true) ? $item['condition'] : null,
                'box' => self::normalizeBox($item['box'] ?? null),
                'storage' => in_array($item['storage'] ?? null, self::STORAGE, true) ? $item['storage'] : null,
            ];
        }, array_filter($items, 'is_array')))];
    }

    /**
     * A model box as [ymin, xmin, ymax, xmax] integers clamped to 0-1000, or null when it's
     * missing, malformed or has no area. Some models answer in 0-1 fractions; those are scaled up.
     */
    public static function normalizeBox(mixed $box): ?array
    {
        if (! is_array($box) || count($box) !== 4) {
            return null;
        }
        $values = array_values($box);
        foreach ($values as $v) {
            if (! is_numeric($v)) {
                return null;
            }
        }
        $values = array_map('floatval', $values);
        if (max($values) <= 1.0) {
            $values = array_map(fn ($v) => $v * 1000, $values);
        }
        [$ymin, $xmin, $ymax, $xmax] = array_map(fn ($v) => (int) round(min(1000, max(0, $v))), $values);

        if ($ymax - $ymin < 5 || $xmax - $xmin < 5) {
            return null;
        }

        return [$ymin, $xmin, $ymax, $xmax];
    }

    /**
     * Fallback response used when OPENROUTER_API_KEY isn't set, or the live
     * call fails - keeps local dev/demoing possible without a key.
     */
    private function mockDetection()
    {
        $rows = [
            ['detected_name' => 'milk bottle', 'parsed_name' => 'Milk', 'confidence' => 0.95, 'condition' => null, 'box' => [80, 60, 520, 260], 'storage' => 'fridge'],
            ['detected_name' => 'yogurt container', 'parsed_name' => 'Yogurt', 'confidence' => 0.88, 'condition' => null, 'box' => [320, 330, 520, 520], 'storage' => 'fridge'],
            ['detected_name' => 'cheese package', 'parsed_name' => 'Cheese', 'confidence' => 0.82, 'condition' => null, 'box' => [380, 600, 520, 900], 'storage' => 'fridge'],
            ['detected_name' => 'bread loaf', 'parsed_name' => 'Bread', 'confidence' => 0.90, 'condition' => null, 'box' => [600, 80, 820, 480], 'storage' => 'pantry'],
            ['detected_name' => 'bag of spinach, leaves visibly wilting', 'parsed_name' => 'Spinach', 'confidence' => 0.55, 'condition' => 'wilting', 'box' => [620, 560, 900, 920], 'storage' => 'fridge'],
        ];

        return array_map(fn ($r) => [
            ...$r,
            'icon' => FoodIconMatcher::guess($r['parsed_name']) ?? '',
            'matched_product_id' => null,
            'confirmed' => false,
        ], $rows);
    }
}
