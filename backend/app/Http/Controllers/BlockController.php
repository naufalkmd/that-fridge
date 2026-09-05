<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BlockController extends Controller
{
    /**
     * Block a user - stops them appearing in search (UserController::search) and stops either
     * side sending a join request or invite to the other (FridgeJoinRequestController), from
     * either the find-a-friend screen or a fridge's profile. Existing memberships/pending
     * requests aren't touched - out of scope for what App Review actually checks for (that
     * contact CAN be stopped going forward), and either side can still decline/leave normally.
     */
    public function store(Request $request, User $user)
    {
        $me = $request->user();

        if ($user->id === $me->id) {
            throw ValidationException::withMessages(['user' => "You can't block yourself."]);
        }

        $me->blocking()->syncWithoutDetaching([$user->id]);

        return response()->noContent();
    }

    public function destroy(Request $request, User $user)
    {
        $request->user()->blocking()->detach($user->id);

        return response()->noContent();
    }
}
