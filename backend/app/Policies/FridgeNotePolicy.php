<?php

namespace App\Policies;

use App\Models\FridgeNote;
use App\Models\User;

class FridgeNotePolicy
{
    /**
     * Every ability - view, update, delete - is the same "is a member of this note's fridge"
     * check, deliberately not split by authorship like every other policy in this app (compare
     * ShoppingItemPolicy, which gates update/delete to the owning user). A fridge note is a
     * shared, communal sticky note - any member can edit or remove any note, not just the one
     * who wrote it. Creating a note authorizes against the parent Fridge's own `update` ability
     * (already member-level - see FridgePolicy), matching how ItemController::store() authorizes
     * against its parent Section rather than a dedicated create() ability on the child.
     */
    public function view(User $user, FridgeNote $note): bool
    {
        return $note->fridge->isMember($user);
    }

    public function update(User $user, FridgeNote $note): bool
    {
        return $note->fridge->isMember($user);
    }

    public function delete(User $user, FridgeNote $note): bool
    {
        return $note->fridge->isMember($user);
    }
}
