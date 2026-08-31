<?php

namespace App\Policies;

use App\Models\NotificationEvent;
use App\Models\User;

class NotificationEventPolicy
{
    public function view(User $user, NotificationEvent $notificationEvent): bool
    {
        return $this->owns($user, $notificationEvent);
    }

    public function update(User $user, NotificationEvent $notificationEvent): bool
    {
        return $this->owns($user, $notificationEvent);
    }

    /**
     * A personally-addressed event (invite, approval) belongs to its target even before
     * they're a member of the fridge it's about; a fridge-wide event belongs to every member.
     */
    private function owns(User $user, NotificationEvent $event): bool
    {
        return $event->user_id === $user->id || $event->fridge->isMember($user);
    }
}
