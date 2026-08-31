<?php

namespace App\Services;

use App\Jobs\SendPushNotification;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\NotificationEvent;
use App\Models\User;

/**
 * One entry point for "tell this user something happened": writes a row to the in-app feed
 * (notification_events) and, if they have a device registered, queues a push.
 *
 * Preference gating matches the expiry/low-stock cron - if the user has a notification_prefs
 * row and the flag mapped to this kind is off, nothing is created at all.
 */
class Notifier
{
    /**
     * kind => [notification_prefs column, push notification title]. A kind absent here is
     * always delivered (no matching pref) with a generic title.
     */
    private const KINDS = [
        'expiring' => ['expiry_alerts', 'Expiring soon'],
        'lowStock' => ['low_stock', 'Running low'],
        'recipe' => ['recipe_tips', 'Recipe idea'],
        'invite' => ['social', 'Fridge invite'],
        'joinRequest' => ['social', 'Join request'],
        'requestApproved' => ['social', 'Request approved'],
        'requestDeclined' => ['social', 'Request declined'],
        'inviteAccepted' => ['social', 'Invite accepted'],
        'inviteDeclined' => ['social', 'Invite declined'],
        'memberLeft' => ['social', 'Someone left'],
        'removed' => ['social', 'Removed from fridge'],
        'itemAdded' => ['crew_actions_enabled', 'New in the fridge'],
        'itemUsed' => ['crew_actions_enabled', 'Item used up'],
        'note' => ['crew_actions_enabled', 'Fridge note'],
    ];

    public static function notify(
        ?User $user,
        string $kind,
        string $message,
        Fridge $fridge,
        ?Item $item = null,
    ): ?NotificationEvent {
        if (! $user) {
            return null;
        }

        [$prefColumn, $title] = self::KINDS[$kind] ?? [null, 'ThatFridge'];

        $pref = $user->notificationPref;
        if ($pref && $prefColumn && ! $pref->{$prefColumn}) {
            return null;
        }

        $event = NotificationEvent::create([
            'fridge_id' => $fridge->id,
            'user_id' => $user->id,
            'item_id' => $item?->id,
            'kind' => $kind,
            'message' => $message,
            'done' => false,
        ]);

        SendPushNotification::dispatch($user->id, $title, $message, [
            'kind' => $kind,
            'fridgeId' => (string) $fridge->id,
            'eventId' => (string) $event->id,
        ]);

        return $event;
    }

    /**
     * Notify every member of a fridge except the person who triggered it.
     */
    public static function notifyFridge(
        Fridge $fridge,
        ?User $actor,
        string $kind,
        string $message,
        ?Item $item = null,
    ): void {
        $fridge->members()
            ->when($actor, fn ($q) => $q->where('users.id', '!=', $actor->id))
            ->with('notificationPref')
            ->get()
            ->each(fn (User $member) => self::notify($member, $kind, $message, $fridge, $item));
    }
}
