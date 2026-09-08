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
            // Couldn't read a date - the vision call still ran, so no refund, but say so.
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
