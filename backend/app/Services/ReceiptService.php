<?php

namespace App\Services;

use App\Support\FoodIconMatcher;
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
            // Receipts can carry location/home context, so unlike recipe icons/attachments
            // this goes on the private disk - signed URL only, never a plain public one.
            $disk = config('filesystems.private_media_disk');
            $path = $file->store('receipts', $disk);

            // null from extractItemsWithVision means the vision call itself failed (API
            // error, exception, unparseable reply) - distinct from it succeeding with a
            // legitimately empty array (not a receipt / no readable items). Only the
            // former should be refunded; the controller needs to tell them apart.
            $aiFailed = false;
            if (! $this->vision->available()) {
                // No API key configured at all - fall back to mock data so local dev/demoing
                // still works without anyone needing to set one up.
                $detectedItems = $this->mockOCR();
            } else {
                $extracted = $this->extractItemsWithVision($file->getRealPath(), $file->getMimeType());
                if ($extracted === null) {
                    $aiFailed = true;
                    $detectedItems = [];
                } else {
                    $detectedItems = $extracted;
                }
            }

            return [
                'receipt_id' => rand(1, 100000),
                'file_path' => $path,
                'file_url' => Storage::disk($disk)->temporaryUrl($path, now()->addMinutes(30)),
                'store_name' => $storeName,
                'purchased_at' => $purchasedAt ?? now()->toDateString(),
                'status' => 'processed',
                'detected_items' => $detectedItems,
                'ai_failed' => $aiFailed,
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

        return array_values(array_map(function ($item) {
            $name = $item['parsed_name'] ?? 'Item';

            return [
                'raw_text' => $item['raw_text'] ?? '',
                'parsed_name' => $name,
                'parsed_quantity' => max(1, (int) ($item['parsed_quantity'] ?? 1)),
                'matched_product_id' => null,
                'icon' => FoodIconMatcher::guess($name) ?? '',
                'confirmed' => false,
            ];
        }, $items));
    }

    /**
     * Fallback response used when OPENROUTER_API_KEY isn't set, or the live
     * call fails - keeps local dev/demoing possible without a key.
     */
    private function mockOCR()
    {
        $rows = [
            ['raw_text' => 'Milk 2L x 1', 'parsed_name' => 'Milk', 'parsed_quantity' => 1],
            ['raw_text' => 'Cheese 200g x 2', 'parsed_name' => 'Cheese', 'parsed_quantity' => 2],
            ['raw_text' => 'Bread x 1', 'parsed_name' => 'Bread', 'parsed_quantity' => 1],
        ];

        return array_map(fn ($r) => [
            ...$r,
            'matched_product_id' => null,
            'icon' => FoodIconMatcher::guess($r['parsed_name']) ?? '',
            'confirmed' => false,
        ], $rows);
    }
}
