<?php

namespace App\Services;

use App\Models\Product;
use App\Support\FoodIconMatcher;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BarcodeService
{
    public function __construct(protected AgentService $agentService) {}

    /**
     * Lookup product info by barcode, preferring our local cache over
     * Open Food Facts (product data barely changes once scanned).
     */
    public function lookup($barcode)
    {
        $cached = Product::where('barcode', $barcode)->first();

        if ($cached) {
            return [
                'name' => $cached->name,
                'category' => $cached->category,
                'barcode' => $cached->barcode,
                'icon' => $cached->icon,
                'default_shelf_life_days' => $cached->default_shelf_life_days,
                'location' => $cached->location,
                'image_url' => $cached->image_url,
            ];
        }

        try {
            $response = Http::get("https://world.openfoodfacts.org/api/v0/product/{$barcode}.json");

            if ($response->status() === 200) {
                $data = $response->json();
                $product = $this->parseResponse($data);

                if ($product && $product['barcode']) {
                    Product::updateOrCreate(['barcode' => $product['barcode']], $product);
                }

                return $product;
            }

            return null; // Barcode not found
        } catch (\Exception $e) {
            Log::error('Barcode lookup failed', ['barcode' => $barcode, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Parse Open Food Facts response into our format. Open Food Facts' own "categories"
     * field is unreliable (missing, in the wrong language, or overly granular), so instead
     * of only matching it against a static keyword table, ask the model to estimate shelf
     * life and storage location from the product name - same call AgentService::suggestItemDetails
     * already makes for the manual "Auto-fill" button, with the same offline/no-key fallback.
     */
    private function parseResponse($data)
    {
        $product = $data['product'] ?? null;

        if (! $product) {
            return null;
        }

        $name = $product['product_name'] ?? 'Unknown Product';
        $icon = FoodIconMatcher::guess($name) ?? '';
        $suggestion = $this->agentService->suggestItemDetails($name, $icon ?: null);

        return [
            'name' => $name,
            'category' => $product['categories'] ?? null,
            'barcode' => $product['code'] ?? null,
            'icon' => $icon,
            'default_shelf_life_days' => $suggestion['shelf_life_days'],
            'location' => $suggestion['location'],
            'image_url' => $product['image_url'] ?? null,
        ];
    }
}
