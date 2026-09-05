<?php

namespace App\Http\Controllers;

use App\Models\Section;
use App\Services\ExpiryScanService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ExpiryScanController extends Controller
{
    // Unlike receipt/photo scan, this one is available to free users client-side (add.tsx
    // doesn't gate it), so it gets a free-tier weekly cap rather than a hard Pro block - same
    // treatment as chat/icon generation. There's no persisted row per scan to count (unlike
    // ChatHistory/GeneratedIcon), so the count lives in cache instead of the database.
    private const FREE_EXPIRY_SCANS_PER_WEEK = 10;

    protected $expiryScanService;

    public function __construct(ExpiryScanService $expiryScanService)
    {
        $this->expiryScanService = $expiryScanService;
    }

    /**
     * Read the printed expiry date off a package photo.
     */
    public function scan(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        if (! $request->user()->isPro()) {
            $weekKey = 'expiry_scan_quota:'.$request->user()->id.':'.Carbon::now()->format('oW');
            $used = (int) Cache::get($weekKey, 0);

            if ($used >= self::FREE_EXPIRY_SCANS_PER_WEEK) {
                return response()->json([
                    'message' => "You've used your ".self::FREE_EXPIRY_SCANS_PER_WEEK." free expiry scans this week. Upgrade to Pro for unlimited scans.",
                ], 402);
            }

            Cache::put($weekKey, $used + 1, now()->addWeek());
        }

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // 5MB max
        ]);

        $result = $this->expiryScanService->extractDate($request->file('image'));

        if (!$result['found']) {
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
