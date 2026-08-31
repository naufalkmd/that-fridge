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
