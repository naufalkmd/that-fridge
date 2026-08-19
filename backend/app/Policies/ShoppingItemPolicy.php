<?php

namespace App\Policies;

use App\Models\ShoppingItem;
use App\Models\User;

class ShoppingItemPolicy
{
    /**
     * Any member of the item's fridge, not just whoever added it - a shopping list is a shared,
     * communal list like the fridge notes board (see FridgeNotePolicy), not a private one.
     */
    public function update(User $user, ShoppingItem $shoppingItem): bool
    {
        return $shoppingItem->fridge->isMember($user);
    }

    public function delete(User $user, ShoppingItem $shoppingItem): bool
    {
        return $shoppingItem->fridge->isMember($user);
    }
}
