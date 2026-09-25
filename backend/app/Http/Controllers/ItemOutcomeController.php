<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\ItemOutcome;
use App\Services\ItemRemovalService;
use Illuminate\Http\Request;

class ItemOutcomeController extends Controller
{
    public function __construct(private ItemRemovalService $removals) {}

    public function correct(Request $request, ItemOutcome $itemOutcome)
    {
        $data = $request->validate(['outcome' => ['required', 'in:used,wasted']]);
        $outcome = $this->removals->correct($request->user(), $itemOutcome, $data['outcome']);

        return response()->json(['id' => (string) $outcome->id, 'outcome' => $outcome->outcome]);
    }

    public function undo(Request $request, ItemOutcome $itemOutcome)
    {
        $item = $this->removals->undo($request->user(), $itemOutcome);

        return (new ItemResource($item->load('product')))->response()->setStatusCode(200);
    }
}
