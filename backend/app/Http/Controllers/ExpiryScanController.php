<?php

namespace App\Http\Controllers;

use App\Models\Section;
use App\Services\CreditService;
use App\Services\ExpiryScanService;
use App\Support\CreditCost;
use Illuminate\Http\Request;

class ExpiryScanController extends Controller
{
    public function __construct(
        protected ExpiryScanService $expiryScanService,
        protected CreditService $credits,
    ) {}

    /**
     * Read the printed expiry date off a package photo. Metered in AI credits.
     */
    public function scan(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // 5MB max
        ]);

        $this->credits->spend($request->user(), CreditCost::EXPIRY_SCAN, 'expiry_scan');

        $result = $this->expiryScanService->extractDate($request->file('image'));

        if (! $result['found']) {
            // A `reason` other than `no_api_key` means an attempted vision call itself failed
            // (rate limited, server/exception, etc.) - refund, since the user got nothing for
            // their credit. `no_api_key` is the local/dev fallback (no real call attempted,
            // same "still charged" behavior as receipt/photo scan's mock data), and no
            // `reason` at all means the model actually ran and legitimately found no date -
            // neither of those is refundable, since a real vision call still ran either way.
            if (isset($result['reason']) && $result['reason'] !== 'no_api_key') {
                $this->credits->grant($request->user(), CreditCost::EXPIRY_SCAN, 'expiry_scan_refund');
            }

            return response()->json([
                'found' => false,
                'message' => 'Could not read a date on that photo. Try a closer, well-lit shot, or enter it manually.',
            ], 200);
        }

        return response()->json([
            'found' => true,
            'date' => $result['date'],
            'raw_text' => $result['raw_text'],
            'confidence' => $result['confidence'],
            'message' => 'Review the date, then confirm.',
        ], 200);
    }
}
