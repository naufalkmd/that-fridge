<?php

namespace App\Observers;

use App\Models\Item;
use App\Services\MachineTriggerService;
use App\Services\Notifier;
use App\Support\OpenedShelfLife;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

/**
 * Keeps the rest of a shared fridge's crew in the loop when someone adds or finishes an item,
 * and fires Machine triggers off the same writes. The Notifier calls stay gated to
 * authenticated web/app requests (factory- or seeder-created items stay silent); Machine
 * dispatch is split the same way for a reason - see itemAdded()/recheckThresholds() below.
 */
class ItemObserver
{
    public function __construct(private MachineTriggerService $machines) {}

    /** Stamp the opening date and estimate together so later rules cannot move the date. */
    public function saving(Item $item): void
    {
        if ($item->isDirty('opened')) {
            if ($item->opened) {
                $override = $item->isDirty('opened_shelf_life_days') ? $item->opened_shelf_life_days : null;
                $resolved = OpenedShelfLife::resolve(
                    $item->name, $item->icon, $item->location, $item->nutrition_category,
                    $item->shelf_life_days, $override,
                );
                if (! $resolved['openable']) {
                    throw ValidationException::withMessages(['opened' => ["This item doesn't have an opening date."]]);
                }
                $item->opened_at = now();
                $item->opened_shelf_life_days = $resolved['days'];
                $item->opened_shelf_life_source = $resolved['source'];
            } else {
                $item->opened_at = null;
                $item->opened_shelf_life_days = null;
                $item->opened_shelf_life_source = null;
            }
        } elseif ($item->opened && $item->isDirty('opened_shelf_life_days')) {
            $item->opened_shelf_life_source = 'user';
        }
    }

    public function created(Item $item): void
    {
        $fridge = $item->section?->fridge;
        if ($fridge) {
            $this->machines->recheckThresholds($fridge);
        }

        if (! Auth::check()) {
            return;
        }

        if ($fridge) {
            $this->machines->itemAdded($item, $fridge);
        }

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
        $fridge = $item->section?->fridge;
        if ($fridge && $item->wasChanged(['quantity', 'weight', 'weight_unit', 'calories', 'custom_fields'])) {
            $this->machines->recheckThresholds($fridge);
        }

        if (! Auth::check()) {
            return;
        }

        $ranOut = $item->wasChanged('quantity')
            && $item->quantity <= 0
            && (int) $item->getOriginal('quantity') > 0;

        if (! $ranOut) {
            return;
        }

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

    /** A delete can only ever move a threshold's totals down - no dirty-check needed. */
    public function deleted(Item $item): void
    {
        $fridge = $item->section?->fridge;
        if ($fridge) {
            $this->machines->recheckThresholds($fridge);
        }
    }
}
