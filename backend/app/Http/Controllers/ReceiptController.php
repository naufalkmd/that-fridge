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
}
