<?php

namespace App\Http\Controllers;

use App\Http\Resources\RecipeResource;
use App\Http\Resources\UserProfileResource;
use App\Http\Resources\UserSearchResource;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Find-a-friend search - prefix match on username, capped and rate-limited (see the
     * 'throttle:20,1' route middleware) since this is the first endpoint in the app with any
     * user-enumeration surface.
     */
    public function search(Request $request)
    {
        $data = $request->validate([
            // min:2 - a single-character prefix is the cheapest way to sweep the whole
            // username space (26 requests covers every user); two characters raises that to
            // 676, on top of the throttle and the 20-result cap.
            'q' => ['required', 'string', 'min:2', 'max:255'],
        ]);

        $me = $request->user();
        $blockedIds = $me->blocking()->pluck('users.id')
            ->merge($me->blockedBy()->pluck('users.id'));

        $users = User::where('username', 'like', $data['q'].'%')
            ->where('id', '!=', $me->id)
            ->whereNotIn('id', $blockedIds)
            ->orderBy('username')
            ->limit(20)
            ->get();

        return UserSearchResource::collection($users);
    }

    /**
     * A friend's public profile - their name/username plus the fridges THEY OWN (not ones
     * they've merely joined, and not fridge contents - just enough to decide whether to
     * request access to one). Each fridge is annotated with the viewer's own role/request
     * status so the frontend can render "Member" / "Requested" / "Request to join" per row
     * without a second round-trip.
     */
    public function profile(Request $request, User $user)
    {
        $viewer = $request->user();

        $fridges = $user->fridges()
            ->withCount('members')
            ->with(['members' => fn ($q) => $q->where('users.id', $viewer->id)])
            ->with(['joinRequests' => fn ($q) => $q->where('requester_id', $viewer->id)])
            ->orderBy('id')
            ->get()
            ->map(fn ($fridge) => [
                'id' => (string) $fridge->id,
                'name' => $fridge->name,
                'memberCount' => $fridge->members_count,
                'role' => $fridge->members->first()?->pivot->role,
                'requestStatus' => $fridge->joinRequests->first()?->status,
            ]);

        $user->setAttribute('profileFridges', $fridges);

        $recipes = $user->recipes()
            ->with(['favoritedBy' => fn ($q) => $q->where('users.id', $viewer->id), 'user:id,name,username'])
            ->orderBy('name')
            ->get();

        $user->setAttribute('profileRecipes', RecipeResource::collection($recipes));
        $user->setAttribute('blockedByMe', $viewer->blocking()->where('users.id', $user->id)->exists());

        return new UserProfileResource($user);
    }
}
