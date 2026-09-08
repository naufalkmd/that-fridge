<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ReceiptService
{
    public function __construct(protected OpenRouterVisionService $vision) {}

    /**
     * Process receipt image upload and extract items via OpenRouter Vision (Claude Haiku).
     */
    public function processReceipt($file, $storeName = null, $purchasedAt = null)
    {
        try {
            // Save file to storage (config('filesystems.media_disk') - "public" locally, R2 in prod once flipped)
            $disk = config('filesystems.media_disk');
            $path = $file->store('receipts', $disk);

            if (! $this->vision->available()) {
                // No API key configured at all - fall back to mock data so local dev/demoing
                // still works without anyone needing to set one up.
                $detectedItems = $this->mockOCR();
            } else {
                // A key is configured, so a real call was attempted. If it failed or the
                // image genuinely isn't a receipt, return an empty result rather than fake
                // data - the frontend already shows a proper "couldn't find any items" message
                // for this case, which is honest instead of silently wrong.
                $detectedItems = $this->extractItemsWithVision($file->getRealPath(), $file->getMimeType()) ?? [];
            }

            return [
                'receipt_id' => rand(1, 100000),
                'file_path' => $path,
                'file_url' => Storage::disk($disk)->url($path),
                'store_name' => $storeName,
                'purchased_at' => $purchasedAt ?? now()->toDateString(),
                'status' => 'processed',
                'detected_items' => $detectedItems,
            ];
        } catch (\Exception $e) {
            Log::error('Receipt processing failed', ['error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Ask OpenRouter Vision (Claude Haiku) to read the receipt image and return line items in
     * the same shape the frontend already expects from mockOCR().
     */
    private function extractItemsWithVision(string $imagePath, string $mimeType): ?array
    {
        $prompt = <<<'PROMPT'
You are reading a photo of a grocery store receipt. Extract every purchased line item.

Return ONLY a JSON array (no prose, no markdown fences) where each element has exactly these fields:
- "raw_text": the line as printed on the receipt (string)
- "parsed_name": a clean, singular, human-readable product name, e.g. "Milk" not "MILK 2% 2L 4.99"
- "parsed_quantity": quantity purchased as a whole number (integer, default 1 if unclear)
- "icon": one lowercase category word for icon lookup, one of: milk, cheese, egg, bread, meat, fish, vegetable, fruit, drink, snack, item
- "matched_product_id": always null
- "confirmed": always false

Ignore non-food lines (subtotal, tax, total, discounts, payment method, store header/footer, loyalty info).
If the image is not a receipt or no items are readable, return an empty array.
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
            'raw_text' => $item['raw_text'] ?? '',
            'parsed_name' => $item['parsed_name'] ?? 'Item',
            'parsed_quantity' => max(1, (int) ($item['parsed_quantity'] ?? 1)),
            'matched_product_id' => null,
            'icon' => $item['icon'] ?? 'item',
            'confirmed' => false,
        ], $items));
    }

    /**
     * Fallback response used when OPENROUTER_API_KEY isn't set, or the live
     * call fails - keeps local dev/demoing possible without a key.
     */
    private function mockOCR()
    {
        return [
            [
                'raw_text' => 'Milk 2L x 1',
                'parsed_name' => 'Milk',
                'parsed_quantity' => 1,
                'matched_product_id' => null,
                'icon' => 'milk',
                'confirmed' => false,
            ],
            [
                'raw_text' => 'Cheese 200g x 2',
                'parsed_name' => 'Cheese',
                'parsed_quantity' => 2,
                'matched_product_id' => null,
                'icon' => 'cheese',
                'confirmed' => false,
            ],
            [
                'raw_text' => 'Bread x 1',
                'parsed_name' => 'Bread',
                'parsed_quantity' => 1,
                'matched_product_id' => null,
                'icon' => 'bread',
                'confirmed' => false,
            ],
        ];
    }

    /**
     * Confirm and prepare items for import
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
                    'quantity' => $item['quantity'] ?? $item['parsed_quantity'] ?? 1,
                    'expiry_date' => $item['expiry_date'] ?? now()->addDays(14)->toDateString(),
                    'shelf_life_days' => $item['shelf_life_days'] ?? 14,
                    'source' => 'receipt',
                ];
            })
            ->toArray();
    }
}