<?php

namespace App\Http\Controllers;

use App\Http\Resources\FridgeNoteResource;
use App\Models\Fridge;
use App\Models\FridgeNote;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FridgeNoteController extends Controller
{
    /**
     * Every note across every fridge the current user belongs to (owned or joined) - one
     * aggregated endpoint fetched at bootstrap, same shape as UserController's myInvites()/
     * FridgeJoinRequestController's myRequests(), rather than one request per fridge.
     */
    public function index(Request $request)
    {
        $fridgeIds = $request->user()->memberFridges()->pluck('fridges.id');

        $notes = FridgeNote::whereIn('fridge_id', $fridgeIds)
            ->with(['fridge', 'user'])
            ->orderByDesc('created_at')
            ->get();

        return FridgeNoteResource::collection($notes);
    }

    /**
     * Authorizes against the parent Fridge's own `update` ability (member-level) rather than a
     * dedicated create() ability on FridgeNote itself - same pattern ItemController::store()
     * uses against its parent Section.
     */
    public function store(Request $request, Fridge $fridge)
    {
        $this->authorize('update', $fridge);

        $data = $request->validate([
            'text' => ['required', 'string', 'max:500'],
            'color' => ['required', 'string', Rule::in(FridgeNote::COLORS)],
        ]);

        $note = $fridge->notes()->create([...$data, 'user_id' => $request->user()->id]);

        return new FridgeNoteResource($note->load(['fridge', 'user']));
    }

    public function update(Request $request, FridgeNote $note)
    {
        $this->authorize('update', $note);

        $data = $request->validate([
            'text' => ['sometimes', 'string', 'max:500'],
            'color' => ['sometimes', 'string', Rule::in(FridgeNote::COLORS)],
        ]);

        $note->update($data);

        return new FridgeNoteResource($note->load(['fridge', 'user']));
    }

    public function destroy(Request $request, FridgeNote $note)
    {
        $this->authorize('delete', $note);

        $note->delete();

        return response()->noContent();
    }
}
