<?php

namespace App\Http\Controllers;

use App\Http\Resources\FridgeJoinRequestResource;
use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FridgeJoinRequestController extends Controller
{
    /**
     * Pending requests to join a fridge - owner-only, the "Manage fridge" sheet's JOIN
     * REQUESTS section.
     */
    public function index(Request $request, Fridge $fridge)
    {
        $this->authorize('manageMembers', $fridge);

        $requests = $fridge->joinRequests()
            ->where('status', 'pending')
            ->with('requester')
            ->orderBy('created_at')
            ->get();

        return FridgeJoinRequestResource::collection($requests);
    }

    /**
     * Request to join a fridge found via a friend's profile. Re-requesting after a decline
     * flips the existing row back to pending instead of creating a duplicate.
     */
    public function store(Request $request, Fridge $fridge)
    {
        $this->authorize('requestJoin', $fridge);

        if ($fridge->isMember($request->user())) {
            throw ValidationException::withMessages(['fridge' => "You're already a member of this fridge."]);
        }

        $joinRequest = FridgeJoinRequest::updateOrCreate(
            ['fridge_id' => $fridge->id, 'requester_id' => $request->user()->id],
            ['status' => 'pending']
        );

        return new FridgeJoinRequestResource($joinRequest->load('requester'));
    }

    /**
     * Approve a pending request - attaches the requester as a member, same operation the
     * old invite-code join() used to perform.
     */
    public function approve(Request $request, FridgeJoinRequest $joinRequest)
    {
        $this->authorize('manageMembers', $joinRequest->fridge);

        $joinRequest->fridge->members()->attach($joinRequest->requester_id, ['role' => 'member']);
        $joinRequest->update(['status' => 'accepted']);

        return response()->noContent();
    }

    /**
     * Decline a pending request - no membership is created.
     */
    public function decline(Request $request, FridgeJoinRequest $joinRequest)
    {
        $this->authorize('manageMembers', $joinRequest->fridge);

        $joinRequest->update(['status' => 'declined']);

        return response()->noContent();
    }
}
