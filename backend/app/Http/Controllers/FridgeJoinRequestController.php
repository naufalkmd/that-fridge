<?php

namespace App\Http\Controllers;

use App\Http\Resources\FridgeJoinRequestResource;
use App\Http\Resources\MyInviteResource;
use App\Http\Resources\MyRequestResource;
use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FridgeJoinRequestController extends Controller
{
    /**
     * Pending requests to join a fridge - owner-only, the "Manage fridge" sheet's JOIN
     * REQUESTS section. Owner-initiated invites (awaiting the invited person's own response,
     * not the owner's) are excluded - see myInvites() for those.
     */
    public function index(Request $request, Fridge $fridge)
    {
        $this->authorize('manageMembers', $fridge);

        $requests = $fridge->joinRequests()
            ->where('status', 'pending')
            ->where('initiated_by', 'requester')
            ->with('requester')
            ->orderBy('created_at')
            ->get();

        return FridgeJoinRequestResource::collection($requests);
    }

    /**
     * Request to join a fridge found via a friend's profile. Re-requesting after a decline
     * flips the existing row back to pending instead of creating a duplicate. If the fridge
     * owner already invited this same user (a pending 'owner'-initiated row exists), this call
     * is really accepting that invite, not creating a competing one.
     */
    public function store(Request $request, Fridge $fridge)
    {
        $this->authorize('requestJoin', $fridge);

        if ($fridge->isMember($request->user())) {
            throw ValidationException::withMessages(['fridge' => "You're already a member of this fridge."]);
        }

        $existing = FridgeJoinRequest::where('fridge_id', $fridge->id)
            ->where('requester_id', $request->user()->id)
            ->first();

        if ($existing && $existing->status === 'pending' && $existing->initiated_by === 'owner') {
            $this->attachMember($fridge, $request->user());
            $existing->update(['status' => 'accepted']);

            return new FridgeJoinRequestResource($existing->load('requester'));
        }

        $joinRequest = FridgeJoinRequest::updateOrCreate(
            ['fridge_id' => $fridge->id, 'requester_id' => $request->user()->id],
            ['status' => 'pending', 'initiated_by' => 'requester']
        );

        return new FridgeJoinRequestResource($joinRequest->load('requester'));
    }

    /**
     * Owner invites a specific user to the fridge directly - the "Manage fridge" sheet's
     * INVITE SOMEONE section. Needs the invited person's own acceptance (approve()/decline()
     * below), same as a self-initiated request needs the owner's. If that user already has a
     * pending request of their own on this fridge, inviting them is just approving it.
     */
    public function invite(Request $request, Fridge $fridge)
    {
        $this->authorize('manageMembers', $fridge);

        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
        ]);

        $target = User::findOrFail($data['userId']);

        if ($fridge->isMember($target)) {
            throw ValidationException::withMessages(['userId' => 'That user is already a member of this fridge.']);
        }

        $existing = FridgeJoinRequest::where('fridge_id', $fridge->id)
            ->where('requester_id', $target->id)
            ->first();

        if ($existing && $existing->status === 'pending' && $existing->initiated_by === 'requester') {
            $this->attachMember($fridge, $target);
            $existing->update(['status' => 'accepted']);

            return new FridgeJoinRequestResource($existing->load('requester'));
        }

        $joinRequest = FridgeJoinRequest::updateOrCreate(
            ['fridge_id' => $fridge->id, 'requester_id' => $target->id],
            ['status' => 'pending', 'initiated_by' => 'owner']
        );

        return new FridgeJoinRequestResource($joinRequest->load('requester'));
    }

    /**
     * Pending invites the owner has sent for this fridge, awaiting the invited person's
     * response - owner-only, the "Manage fridge" sheet's INVITES SENT section, so an owner can
     * see (and cancel) an invite instead of just waiting on it silently.
     */
    public function sentInvites(Request $request, Fridge $fridge)
    {
        $this->authorize('manageMembers', $fridge);

        $invites = $fridge->joinRequests()
            ->where('status', 'pending')
            ->where('initiated_by', 'owner')
            ->with('requester')
            ->orderBy('created_at')
            ->get();

        return FridgeJoinRequestResource::collection($invites);
    }

    /**
     * Every pending invite sent TO the current user, across all fridges - the "MY INVITES"
     * entry point (find-a-friend screen), since an invite needs to be visible without having
     * to stumble onto the inviter's profile.
     */
    public function myInvites(Request $request)
    {
        $invites = FridgeJoinRequest::where('requester_id', $request->user()->id)
            ->where('status', 'pending')
            ->where('initiated_by', 'owner')
            ->with('fridge.user')
            ->orderBy('created_at')
            ->get();

        return MyInviteResource::collection($invites);
    }

    /**
     * Every pending request to join a fridge the current user owns, across all their fridges -
     * the Notifications page's counterpart to myInvites() above, so an incoming request is
     * visible there too, not just in that one fridge's Manage Fridge sheet.
     */
    public function myRequests(Request $request)
    {
        $fridgeIds = $request->user()->fridges()->pluck('id');

        $requests = FridgeJoinRequest::whereIn('fridge_id', $fridgeIds)
            ->where('status', 'pending')
            ->where('initiated_by', 'requester')
            ->with(['fridge', 'requester'])
            ->orderBy('created_at')
            ->get();

        return MyRequestResource::collection($requests);
    }

    /**
     * Approve a pending request/invite - attaches the target as a member. Who's allowed to
     * call this depends on which side initiated it: the fridge owner approves an incoming
     * request; the invited person accepts their own invite.
     */
    public function approve(Request $request, FridgeJoinRequest $joinRequest)
    {
        // Strictly the non-initiating side, unlike decline() below - an owner "approving" their
        // own sent invite would silently add the invited person without their consent, which is
        // exactly what needing acceptance was meant to prevent. Only the invited person can
        // accept their own invite; only the owner can approve someone else's request.
        if ($joinRequest->initiated_by === 'owner') {
            abort_if($request->user()->id !== $joinRequest->requester_id, 403);
        } else {
            $this->authorize('manageMembers', $joinRequest->fridge);
        }

        $this->attachMember($joinRequest->fridge, $joinRequest->requester);
        $joinRequest->update(['status' => 'accepted']);

        return response()->noContent();
    }

    /**
     * Decline a pending request/invite - no membership is created. Unlike approve() above, an
     * owner-initiated invite can be declined by either side: the invited person turning it
     * down, or the owner canceling an invite they no longer want outstanding - both just mean
     * "this doesn't happen," so both are safe to allow.
     */
    public function decline(Request $request, FridgeJoinRequest $joinRequest)
    {
        if ($joinRequest->initiated_by === 'owner') {
            $isInvitee = $request->user()->id === $joinRequest->requester_id;
            $isOwner = $joinRequest->fridge->isOwner($request->user());
            abort_unless($isInvitee || $isOwner, 403);
        } else {
            $this->authorize('manageMembers', $joinRequest->fridge);
        }

        $joinRequest->update(['status' => 'declined']);

        return response()->noContent();
    }

    /**
     * Guard against a double-click/two-tab approve racing itself (or an invite/request racing
     * its own auto-accept path above): fridge_members has a unique (fridge_id, user_id) index,
     * so a second concurrent attach() would 500. The membership check narrows the window; the
     * catch covers what's left of it rather than trusting a check-then-act to be atomic.
     */
    private function attachMember(Fridge $fridge, User $user): void
    {
        if ($fridge->isMember($user)) {
            return;
        }

        try {
            $fridge->members()->attach($user->id, ['role' => 'member']);
        } catch (QueryException $e) {
            if (! $fridge->isMember($user)) {
                throw $e;
            }
        }
    }
}
