<?php

namespace App\Policies;

use App\Models\MealEntry;
use App\Models\User;

class MealEntryPolicy
{
    public function view(User $user, MealEntry $entry): bool
    {
        return $this->allowed($user, $entry);
    }

    public function update(User $user, MealEntry $entry): bool
    {
        return $this->allowed($user, $entry);
    }

    public function delete(User $user, MealEntry $entry): bool
    {
        return $this->allowed($user, $entry);
    }

    /** The author always; other members of the entry's fridge only while its owner is Pro. */
    private function allowed(User $user, MealEntry $entry): bool
    {
        if ($entry->user_id === $user->id) {
            return true;
        }

        return $entry->fridge_id !== null
            && $entry->fridge->isMember($user)
            && $entry->fridge->user->isPro();
    }
}
