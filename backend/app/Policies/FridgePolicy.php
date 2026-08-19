<?php

namespace App\Policies;

use App\Models\Fridge;
use App\Models\User;

class FridgePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Fridge $fridge): bool
    {
        return $fridge->isMember($user);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Fridge $fridge): bool
    {
        return $fridge->isMember($user);
    }

    public function delete(User $user, Fridge $fridge): bool
    {
        return $fridge->isOwner($user);
    }

    /**
     * Removing a member, and listing/approving/declining join requests - kept owner-only
     * rather than opened up to every member, unlike view/update above.
     */
    public function manageMembers(User $user, Fridge $fridge): bool
    {
        return $fridge->isOwner($user);
    }

    /**
     * Requesting to join a fridge you're not already on. Unconditionally true, like
     * create()/viewAny() above - there's no secret to gate on (that's the point of
     * request-to-join over an invite code), so the real business rule ("already a member")
     * lives in FridgeJoinRequestController::store() as a validation error, not here.
     */
    public function requestJoin(User $user, Fridge $fridge): bool
    {
        return true;
    }
}
