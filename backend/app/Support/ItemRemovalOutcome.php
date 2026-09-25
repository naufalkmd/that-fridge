<?php

namespace App\Support;

use App\Models\Item;

/** First matching rule wins. This decision is intentionally deterministic. */
final class ItemRemovalOutcome
{
    /** @return array{outcome: string, confidence: string, predicted_days: ?int, actual_days: int} */
    public static function classify(Item $item, ?string $context = null): array
    {
        $days = ItemFreshness::effectiveDaysUntilExpiry($item);
        $age = $item->created_at ? (int) $item->created_at->diffInDays(now()) : 0;
        $result = match (true) {
            $context === 'clear_expired' => ['wasted', 'high'],
            $context === 'undo_add' => ['entry_mistake', 'high'],
            in_array($context, ['machine_used', 'chat_used', 'recipe_used'], true) => ['used', 'high'],
            $item->created_at && $item->created_at->greaterThan(now()->subMinutes(10)) => ['entry_mistake', 'high'],
            $days !== null && $days < 0 => ['wasted', 'high'],
            $days !== null => ['used', 'medium'],
            default => ['used', 'low'],
        };

        return [
            'outcome' => $result[0],
            'confidence' => $result[1],
            'predicted_days' => $days,
            'actual_days' => $age,
        ];
    }
}
