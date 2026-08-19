<?php

namespace App\Policies;

use App\Models\Item;
use App\Models\User;

class ItemPolicy
{
    public function view(User $user, Item $item): bool
    {
        return $item->section->fridge->isMember($user);
    }

    public function update(User $user, Item $item): bool
    {
        return $item->section->fridge->isMember($user);
    }

    public function delete(User $user, Item $item): bool
    {
        return $item->section->fridge->isMember($user);
    }
}
