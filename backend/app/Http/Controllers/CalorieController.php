<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Services\AgentService;
use App\Services\CreditService;
use App\Services\NutritionLabelService;
use App\Support\CreditCost;
use Illuminate\Http\Request;

class CalorieController extends Controller
{
    public function __construct(
        protected AgentService $agent,
        protected NutritionLabelService $labels,
        protected CreditService $credits,
    ) {}

    /**
     * AI calorie estimate for an existing item, from its name/weight. Metered in AI credits.
     * Unlike AgentController::suggestItemDetails, this item already exists and belongs to
     * someone, so it needs its own authorization check.
     */
    public function estimate(Request $request, Item $item)
    {
        $this->authorize('update', $item);

        $this->credits->spend($request->user(), CreditCost::CALORIE_ESTIMATE, 'calorie_estimate');

        $result = $this->agent->estimateCalories($item->name, $item->weight, $item->weight_unit, $item->quantity ?? 1);

        // No refund path: the fallback always returns a usable number, so the user never
        // gets nothing for their credit (same as AgentController::suggestItemDetails).
        return response()->json($result, 200);
    }

    /**
     * Read the calorie figure off a nutrition-label photo. Metered in AI credits; refund
     * logic mirrors ExpiryScanController::scan exactly.
     */
    public function scanLabel(Request $request, Item $item)
    {
        $this->authorize('update', $item);

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // 5MB max
        ]);

        $this->credits->spend($request->user(), CreditCost::LABEL_SCAN, 'label_scan');

        $result = $this->labels->extractCalories($request->file('image'));

        if (! $result['found']) {
            // A `reason` other than `no_api_key` means an attempted vision call itself failed
            // - refund, since the user got nothing for their credit. `no_api_key` never
            // attempted a real call (nothing to refund), and no `reason` at all means the
            // model actually ran and legitimately found no calorie figure - neither of those
            // is refundable, since a real vision call still ran either way.
            if (isset($result['reason']) && $result['reason'] !== 'no_api_key') {
                $this->credits->grant($request->user(), CreditCost::LABEL_SCAN, 'label_scan_refund');
            }

            return response()->json([
                'found' => false,
                'message' => "Couldn't read a calorie figure on that label. Try a closer, well-lit shot, or type it in.",
            ], 200);
        }

        return response()->json([
            'found' => true,
            'calories' => $result['calories'],
            'serving_size' => $result['serving_size'],
            'confidence' => $result['confidence'],
            'message' => 'Review the number, then confirm.',
        ], 200);
    }
}
