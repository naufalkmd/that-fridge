<?php

namespace App\Http\Controllers;

use App\Models\Section;
use App\Services\BarcodeService;
use App\Support\AlgoFeedback;
use Illuminate\Http\Request;

class BarcodeController extends Controller
{
    protected $barcodeService;

    public function __construct(BarcodeService $barcodeService)
    {
        $this->barcodeService = $barcodeService;
    }

    /**
     * Scan barcode, lookup product, return suggestion
     */
    public function scan(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $request->validate([
            'barcode' => 'required|string',
        ]);

        $barcode = $request->input('barcode');

        // Look up product from Open Food Facts
        $product = $this->barcodeService->lookup($barcode);

        if (! $product) {
            // Every barcode the product database doesn't know, named or not: the admin's
            // "Barcodes we couldn't find" list (Algorithm insights). A barcode isn't personal.
            AlgoFeedback::record($request->user(), 'barcode', [
                'kind' => 'lookup_miss', 'guess' => mb_substr((string) $barcode, 0, 64), 'source' => 'scan',
            ]);

            return response()->json([
                'error' => 'Barcode not found in database',
                'barcode' => $barcode,
            ], 404);
        }

        // Return suggestion (user still needs to set quantity/expiry/confirm)
        return response()->json([
            'suggestion' => [
                'name' => $product['name'],
                'icon' => $product['icon'],
                'category' => $product['category'],
                'default_shelf_life_days' => $product['default_shelf_life_days'],
                'location' => $product['location'] ?? null,
                'barcode' => $product['barcode'],
                'image_url' => $product['image_url'],
            ],
            'message' => 'Review and set quantity/expiry, then confirm to add',
        ], 200);
    }
}
