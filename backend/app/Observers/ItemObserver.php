<?php

namespace App\Observers;

use App\Models\Item;
use App\Services\Notifier;
use Illuminate\Support\Facades\Auth;

/**
 * Keeps the rest of a shared fridge's crew in the loop when someone adds or finishes an
 * item. Only fires for authenticated web/app requests - factory- or seeder-created items
 * (no logged-in user) stay silent.
 */
class ItemObserver
{
    /**
     * Stamps `opened_at` whenever `opened` flips, so ItemResource can count down the 3-day
     * "opened" window from the moment it actually happened instead of re-deriving a frozen
     * cap from today's date on every request. Not client-settable - this is the only place
     * it's written.
     */
    public function saving(Item $item): void
    {
        if ($item->isDirty('opened')) {
            $item->opened_at = $item->opened ? now() : null;
        }
    }

    public function created(Item $item): void
    {
        if (! Auth::check()) {
            return;
        }

        $fridge = $item->section?->fridge;
        if (! $fridge || $fridge->members()->count() < 2) {
            return;
        }

        Notifier::notifyFridge(
            $fridge,
            Auth::user(),
            'itemAdded',
            '@'.Auth::user()->username." added {$item->name} to {$fridge->name}",
            $item,
        );
    }

    public function updated(Item $item): void
    {
        if (! Auth::check()) {
            return;
        }

        $ranOut = $item->wasChanged('quantity')
            && $item->quantity <= 0
            && (int) $item->getOriginal('quantity') > 0;

        if (! $ranOut) {
            return;
        }

        $fridge = $item->section?->fridge;
        if (! $fridge || $fridge->members()->count() < 2) {
            return;
        }

        Notifier::notifyFridge(
            $fridge,
            Auth::user(),
            'itemUsed',
            '@'.Auth::user()->username." used up {$item->name} in {$fridge->name}",
            $item,
        );
    }
}
