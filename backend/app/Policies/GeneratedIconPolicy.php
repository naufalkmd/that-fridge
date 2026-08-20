<?php

namespace App\Policies;

use App\Models\GeneratedIcon;
use App\Models\User;

class GeneratedIconPolicy
{
    public function delete(User $user, GeneratedIcon $generatedIcon): bool
    {
        return $generatedIcon->user_id === $user->id;
    }
}
