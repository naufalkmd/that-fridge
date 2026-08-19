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
     * Regenerating the invite code or removing a member - kept owner-only rather than
     * opened up to every member, unlike view/update above.
     */
    public function manageMembers(User $user, Fridge $fridge): bool
    {
        return $fridge->isOwner($user);
    }
}
