<?php

namespace App\Policies;

use App\Models\Section;
use App\Models\User;

class SectionPolicy
{
    public function view(User $user, Section $section): bool
    {
        return $section->fridge->isMember($user);
    }

    public function update(User $user, Section $section): bool
    {
        return $section->fridge->isMember($user);
    }

    public function delete(User $user, Section $section): bool
    {
        return $section->fridge->isMember($user);
    }
}
