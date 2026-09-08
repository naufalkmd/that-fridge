<?php

namespace App\Http\Controllers;

use App\Models\Section;
use App\Services\CreditService;
use App\Services\ReceiptService;
use App\Support\CreditCost;
use Illuminate\Http\Request;

class ReceiptController extends Controller
{
    public function __construct(
        protected ReceiptService $receiptService,
        protected CreditService $credits,
    ) {}

    /**
     * Upload receipt image and extract items via OCR. Metered in AI credits (used to be
     * Pro-only).
     */
    public function scan(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // 5MB max
            'store_name' => 'nullable|string|max:255',
            'purchased_at' => 'nullable|date_format:Y-m-d',
        ]);

        $this->credits->spend($request->user(), CreditCost::RECEIPT_SCAN, 'receipt_scan');

        $result = $this->receiptService->processReceipt(
            $request->file('image'),
            $request->input('store_name'),
            $request->input('purchased_at')
        );

        if (! $result) {
            $this->credits->grant($request->user(), CreditCost::RECEIPT_SCAN, 'receipt_scan_refund');

            return response()->json(['error' => 'Failed to process receipt'], 500);
        }

        return response()->json([
            'receipt_id' => $result['receipt_id'],
            'status' => $result['status'],
            'file_url' => $result['file_url'],
            'detected_items' => $result['detected_items'],
            'message' => 'Review items, then confirm to add to inventory',
        ], 200);
    }

    /**
     * Confirm receipt items and prepare for import
     */
    public function confirm(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $request->validate([
            'receipt_id' => 'required|integer',
            'items' => 'required|array',
            'items.*.name' => 'required|string',
            'items.*.icon' => 'required|string',
            'items.*.location' => 'required|in:fridge,freezer,pantry',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.expiry_date' => 'required|date_format:Y-m-d',
            'items.*.shelf_life_days' => 'nullable|integer|min:1',
            'items.*.confirmed' => 'required|boolean',
        ]);

        $confirmedItems = $this->receiptService->confirmItems($request->input('items'));

        if (empty($confirmedItems)) {
            return response()->json(['error' => 'No items confirmed'], 400);
        }

        // Mock: would call Track A's POST /api/sections/{section}/items for each item
        return response()->json([
            'receipt_id' => $request->input('receipt_id'),
            'status' => 'imported',
            'created_items' => $confirmedItems,
            'message' => count($confirmedItems).' items added to inventory',
        ], 201);
    }
}
