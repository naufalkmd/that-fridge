<?php

namespace App\Policies;

use App\Models\Recipe;
use App\Models\User;

class RecipePolicy
{
    /**
     * Every recipe (curated or anyone's custom one) is viewable/favoritable by any
     * authenticated user - there's no privacy toggle, matching how a user's fridges are
     * already unconditionally visible on their profile. update()/delete() below stay
     * owner-only; this is the only ability those two don't reuse.
     */
    public function view(User $user, Recipe $recipe): bool
    {
        return true;
    }

    public function update(User $user, Recipe $recipe): bool
    {
        return $recipe->user_id === $user->id;
    }

    public function delete(User $user, Recipe $recipe): bool
    {
        return $recipe->user_id === $user->id;
    }
}
