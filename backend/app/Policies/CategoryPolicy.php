<?php

namespace App\Policies;

use App\Models\Category;
use App\Models\User;

class CategoryPolicy
{
    /**
     * A category is private to the user who created it (compare ShoppingItemPolicy, which is
     * fridge-communal). Nothing about categories is shared across a fridge's members.
     */
    public function update(User $user, Category $category): bool
    {
        return $category->user_id === $user->id;
    }

    public function delete(User $user, Category $category): bool
    {
        return $category->user_id === $user->id;
    }
}
