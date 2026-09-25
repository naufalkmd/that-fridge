<?php

namespace App\Support;

use App\Models\Item;
use App\Models\User;
use Illuminate\Support\Carbon;

/** Structured item guesses and corrections. Never records notes or custom fields. */
final class ItemFeedback
{
    public static function snapshot(Item $item): array
    {
        return [
            'nutrition_category' => $item->nutrition_category,
            'icon' => $item->icon,
            'location' => $item->location,
            'shelf_life_days' => $item->shelf_life_days,
            'expiry_date' => $item->expiry_date?->toDateString(),
            'opened' => (bool) $item->opened,
            'opened_shelf_life_days' => $item->opened_shelf_life_days,
            'opened_shelf_life_source' => $item->opened_shelf_life_source,
        ];
    }

    public static function created(User $user, Item $item, array $suggested = [], ?string $startedAt = null): void
    {
        $group = FoodGroupClassifier::classifyWithSource($item->name, $item->icon);
        $seconds = null;
        if ($startedAt !== null) {
            $elapsed = now()->timestamp - Carbon::parse($startedAt)->timestamp;
            $seconds = $elapsed >= 0 && $elapsed <= 86400 ? (float) $elapsed : null;
        }
        AlgoFeedback::record($user, 'add_flow', [
            'kind' => 'saved', 'name' => $item->name, 'class' => $group['category'],
            'source' => $item->source ?? 'manual', 'final_number' => $seconds,
            'outcome' => $suggested ? 'autofill_used' : 'no_autofill',
        ]);
        $hasSuggestedCategory = array_key_exists('suggested_nutrition_category', $suggested);
        $guess = $hasSuggestedCategory
            ? $suggested['suggested_nutrition_category']
            : ($group['category'] ?? FoodGroupClassifier::resolve($item->name, $item->icon));
        if ($guess !== null || $item->nutrition_category !== null) {
            AlgoFeedback::record($user, 'food_group', [
                'kind' => 'assigned', 'name' => $item->name, 'class' => $group['category'],
                'guess' => $guess, 'final' => $item->nutrition_category,
                'source' => $hasSuggestedCategory ? 'autofill' : ($group['source'] ?? ($guess ? 'cache' : 'unknown')),
                'outcome' => $guess === $item->nutrition_category ? 'accepted' : 'corrected',
            ]);
        }

        $iconGuess = FoodIconMatcher::guess($item->name);
        $iconFinal = self::safeIcon($item->icon);
        if ($iconGuess !== null || $iconFinal !== null) {
            AlgoFeedback::record($user, 'icon', [
                'kind' => 'assigned', 'name' => $item->name,
                'class' => $iconGuess,
                'guess' => $iconGuess, 'final' => $iconFinal,
                'source' => 'matcher',
                'outcome' => $iconGuess === $iconFinal ? 'accepted' : 'corrected',
            ]);
        }

        if (isset($suggested['suggested_shelf_life_days'])) {
            AlgoFeedback::record($user, 'shelf_life', [
                'kind' => 'saved', 'name' => $item->name, 'class' => $group['category'],
                'guess_number' => (float) $suggested['suggested_shelf_life_days'],
                'final_number' => $item->shelf_life_days !== null ? (float) $item->shelf_life_days : null,
                'source' => 'autofill',
                'outcome' => (int) $suggested['suggested_shelf_life_days'] === (int) $item->shelf_life_days ? 'accepted' : 'corrected',
            ]);
        }
        if (isset($suggested['suggested_location'])) {
            AlgoFeedback::record($user, 'storage', [
                'kind' => 'saved', 'name' => $item->name, 'class' => $group['category'],
                'guess' => $suggested['suggested_location'], 'final' => $item->location,
                'source' => 'autofill',
                'outcome' => $suggested['suggested_location'] === $item->location ? 'accepted' : 'corrected',
            ]);
        }
    }

    public static function updated(User $user, Item $item, array $before): void
    {
        $group = FoodGroupClassifier::classifyWithSource($item->name, $item->icon);
        foreach ([
            'nutrition_category' => 'food_group',
            'icon' => 'icon',
            'location' => 'storage',
        ] as $field => $algo) {
            $old = $before[$field];
            $new = $item->{$field};
            if ($old === $new) {
                continue;
            }
            AlgoFeedback::record($user, $algo, [
                'kind' => 'corrected', 'name' => $item->name,
                'class' => $group['category'],
                'guess' => $field === 'icon' ? self::safeIcon($old) : $old,
                'final' => $field === 'icon' ? self::safeIcon($new) : $new,
                'source' => 'user_edit', 'outcome' => 'corrected',
            ]);
        }

        if ($before['shelf_life_days'] !== $item->shelf_life_days ||
            $before['expiry_date'] !== $item->expiry_date?->toDateString()) {
            AlgoFeedback::record($user, 'shelf_life', [
                'kind' => 'corrected', 'name' => $item->name, 'class' => $group['category'],
                'guess_number' => $before['shelf_life_days'] !== null ? (float) $before['shelf_life_days'] : null,
                'final_number' => $item->shelf_life_days !== null ? (float) $item->shelf_life_days : null,
                'source' => 'user_edit', 'outcome' => 'corrected',
            ]);
        }

        if (! $before['opened'] && $item->opened) {
            $rule = OpenedShelfLife::resolve(
                $item->name, $item->icon, $item->location,
                $item->nutrition_category, $item->shelf_life_days,
            );
            AlgoFeedback::record($user, 'opened', [
                'kind' => $rule['openable'] ? 'opened_resolved' : 'openable_forced',
                'name' => $item->name, 'class' => $group['category'],
                'guess_number' => $rule['days'],
                'final_number' => $item->opened_shelf_life_days,
                'source' => $item->opened_shelf_life_source,
                'outcome' => 'opened',
            ]);
        } elseif ($before['opened'] && ! $item->opened) {
            AlgoFeedback::record($user, 'opened', [
                'kind' => 'opened_undone', 'name' => $item->name,
                'class' => $group['category'], 'source' => 'user_edit', 'outcome' => 'sealed',
            ]);
        } elseif ($before['opened'] && $item->opened &&
            $before['opened_shelf_life_days'] !== $item->opened_shelf_life_days) {
            AlgoFeedback::record($user, 'opened', [
                'kind' => 'opened_override', 'name' => $item->name, 'class' => $group['category'],
                'guess_number' => $before['opened_shelf_life_days'],
                'final_number' => $item->opened_shelf_life_days,
                'source' => 'user', 'outcome' => 'corrected',
            ]);
        }
    }

    private static function safeIcon(?string $icon): ?string
    {
        return $icon !== null && preg_match('/^[a-z0-9_-]{1,80}$/', $icon) ? $icon : null;
    }
}
