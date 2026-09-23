<?php

namespace App\Policies;

use App\Models\Machine;
use App\Models\User;

/**
 * A Machine is scoped to its owner only (user_id), not fridge membership - unlike Item/
 * FridgeNote/etc, this is a personal automation (closer to a personal Shortcut) rather than
 * a shared household feature, even though it targets a shared fridge's data.
 */
class MachinePolicy
{
    public function view(User $user, Machine $machine): bool
    {
        return $machine->user_id === $user->id;
    }

    public function update(User $user, Machine $machine): bool
    {
        return $machine->user_id === $user->id;
    }

    public function delete(User $user, Machine $machine): bool
    {
        return $machine->user_id === $user->id;
    }
}
