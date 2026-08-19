<?php

namespace App\Http\Controllers;

use App\Http\Resources\FridgeMemberResource;
use App\Models\Fridge;
use App\Models\User;
use Illuminate\Http\Request;

class FridgeMemberController extends Controller
{
    /**
     * List everyone with access to a fridge, owner first then by join order - the "Manage
     * fridge" screen's member list. Any member can see who else is on the fridge, not just
     * the owner.
     */
    public function index(Request $request, Fridge $fridge)
    {
        $this->authorize('view', $fridge);

        $members = $fridge->members()
            ->orderByRaw("case when fridge_members.role = 'owner' then 0 else 1 end")
            ->orderBy('fridge_members.created_at')
            ->get();

        return FridgeMemberResource::collection($members);
    }

    /**
     * Remove another member from the fridge. Owner-only, and the owner can't remove
     * themselves this way - deleting the fridge is the only way to walk away from it as
     * owner in v1 (no ownership transfer yet).
     */
    public function destroy(Request $request, Fridge $fridge, User $user)
    {
        $this->authorize('manageMembers', $fridge);

        if ($fridge->isOwner($user)) {
            return response()->json(['error' => "The owner can't be removed - delete the fridge instead."], 422);
        }

        $fridge->members()->detach($user->id);

        return response()->noContent();
    }

    /**
     * Leave a fridge you're a member of but don't own.
     */
    public function leave(Request $request, Fridge $fridge)
    {
        $this->authorize('view', $fridge);

        if ($fridge->isOwner($request->user())) {
            return response()->json(['error' => "As the owner, you can't leave - delete the fridge instead."], 422);
        }

        $fridge->members()->detach($request->user()->id);

        return response()->noContent();
    }
}
