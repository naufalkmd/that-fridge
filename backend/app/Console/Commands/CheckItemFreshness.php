<?php

namespace App\Console\Commands;

use App\Models\Item;
use App\Models\NotificationEvent;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('app:check-item-freshness')]
#[Description('Scan items nearing expiry and running low on stock, creating notification events for users who want them')]
class CheckItemFreshness extends Command
{
    /**
     * Items within this many days of expiry (or already expired) get flagged.
     */
    private const WARNING_WINDOW_DAYS = 3;

    /**
     * Items at or below this quantity get flagged as low stock - matches the threshold
     * getLowStockItem already uses on the frontend (frontend/lib/thatfridge/selectors.ts).
     */
    private const LOW_STOCK_THRESHOLD = 2;

    /**
     * Execute the console command.
     */
    public function handle(): void
    {
        $this->checkExpiring();
        $this->checkLowStock();
    }

    private function checkExpiring(): void
    {
        $items = Item::query()
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', now()->addDays(self::WARNING_WINDOW_DAYS)->toDateString())
            ->with('section.fridge.user.notificationPref')
            ->get();

        $alreadyNotifiedItemIds = NotificationEvent::query()
            ->where('kind', 'expiring')
            ->whereIn('item_id', $items->pluck('id'))
            ->pluck('item_id')
            ->flip();

        $created = 0;

        foreach ($items as $item) {
            $daysLeft = (int) now()->startOfDay()->diffInDays($item->expiry_date->copy()->startOfDay(), false);

            if ($daysLeft > self::WARNING_WINDOW_DAYS) {
                continue;
            }

            $fridge = $item->section->fridge;
            $user = $fridge->user;

            if ($user->notificationPref && ! $user->notificationPref->expiry_alerts) {
                continue;
            }

            if ($alreadyNotifiedItemIds->has($item->id)) {
                continue;
            }

            $message = $daysLeft < 0
                ? "\"{$item->name}\" expired ".abs($daysLeft).' day(s) ago'
                : ($daysLeft === 0
                    ? "\"{$item->name}\" expires today"
                    : "\"{$item->name}\" expires in {$daysLeft} day(s)");

            NotificationEvent::create([
                'fridge_id' => $fridge->id,
                'item_id' => $item->id,
                'kind' => 'expiring',
                'message' => $message,
                'done' => false,
            ]);

            $created++;
        }

        $this->info("Created {$created} expiry notification(s).");
    }

    private function checkLowStock(): void
    {
        $items = Item::query()
            ->where('quantity', '<=', self::LOW_STOCK_THRESHOLD)
            ->with('section.fridge.user.notificationPref')
            ->get();

        $alreadyNotifiedItemIds = NotificationEvent::query()
            ->where('kind', 'lowStock')
            ->whereIn('item_id', $items->pluck('id'))
            ->pluck('item_id')
            ->flip();

        $created = 0;

        foreach ($items as $item) {
            $fridge = $item->section->fridge;
            $user = $fridge->user;

            if ($user->notificationPref && ! $user->notificationPref->low_stock) {
                continue;
            }

            if ($alreadyNotifiedItemIds->has($item->id)) {
                continue;
            }

            NotificationEvent::create([
                'fridge_id' => $fridge->id,
                'item_id' => $item->id,
                // Must be exactly "lowStock" (camelCase) - NotificationHistoryScreen.tsx's
                // KIND_META[event.kind] lookup has no fallback for an unrecognized kind.
                'kind' => 'lowStock',
                'message' => "\"{$item->name}\" is running low ({$item->quantity} left)",
                'done' => false,
            ]);

            $created++;
        }

        $this->info("Created {$created} low-stock notification(s).");
    }
}
