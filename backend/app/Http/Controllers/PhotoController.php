<?php

namespace App\Http\Controllers;

use App\Models\Section;
use App\Services\CreditService;
use App\Services\PhotoService;
use App\Support\CreditCost;
use Illuminate\Http\Request;

class PhotoController extends Controller
{
    public function __construct(
        protected PhotoService $photoService,
        protected CreditService $credits,
    ) {}

    /**
     * Upload fridge photo and detect items. Metered in AI credits (used to be Pro-only).
     */
    public function scan(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // 5MB max
        ]);

        $this->credits->spend($request->user(), CreditCost::PHOTO_SCAN, 'photo_scan');

        $result = $this->photoService->processPhoto($request->file('image'));

        if (! $result) {
            $this->credits->grant($request->user(), CreditCost::PHOTO_SCAN, 'photo_scan_refund');

            return response()->json(['error' => 'Failed to process photo'], 500);
        }

        return response()->json([
            'photo_scan_id' => $result['photo_scan_id'],
            'status' => $result['status'],
            'file_url' => $result['file_url'],
            'detected_items' => $result['detected_items'],
            'message' => 'Review detected items, then confirm to add',
        ], 200);
    }
}
