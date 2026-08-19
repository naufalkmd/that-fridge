<?php

namespace App\Policies;

use App\Models\NotificationEvent;
use App\Models\User;

class NotificationEventPolicy
{
    public function view(User $user, NotificationEvent $notificationEvent): bool
    {
        return $notificationEvent->fridge->isMember($user);
    }

    public function update(User $user, NotificationEvent $notificationEvent): bool
    {
        return $notificationEvent->fridge->isMember($user);
    }
}
