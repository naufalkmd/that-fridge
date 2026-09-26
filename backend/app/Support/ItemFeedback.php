<?php

namespace App\Support;

use App\Models\Item;
use App\Models\ItemOutcome;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

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
        self::restocked($user, $item, $group['category']);
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

    /**
     * Receipt/photo scans: the AI-cleaned `parsed_name` vs the name the user kept. Names are
     * stored (normalized) only when they differ - that pair is the OCR-cleaning corpus; an
     * unchanged name is just an "accepted" count.
     */
    public static function scanned(User $user, Item $item, ?string $parsedName): void
    {
        if ($parsedName === null || ! in_array($item->source, ['receipt', 'photo'], true)) {
            return;
        }

        $guess = AlgoFeedback::nameKey($parsedName);
        $final = AlgoFeedback::nameKey($item->name);
        $changed = $guess !== $final;
        AlgoFeedback::record($user, 'scan', [
            'kind' => 'saved', 'name' => $item->name,
            'class' => FoodGroupClassifier::classify($item->name, $item->icon),
            'guess' => $changed ? $guess : null, 'final' => $changed ? $final : null,
            'source' => $item->source, 'outcome' => $changed ? 'corrected' : 'accepted',
        ]);
    }

    /**
     * Restock cadence: a new item matching one this user removed recently. Matched on the same
     * normalized name the removal recorded (only kept while sharing is on, never for entry
     * mistakes), so this needs no extra data.
     */
    private static function restocked(User $user, Item $item, ?string $class): void
    {
        $key = AlgoFeedback::nameKey($item->name);
        if ($key === null) {
            return;
        }

        $previous = ItemOutcome::where('user_id', $user->id)->where('name_key', $key)
            ->whereIn('outcome', ['used', 'wasted'])->whereNull('undone_at')
            ->where('created_at', '>=', now()->subDays(90))
            ->latest('created_at')->first();
        if (! $previous) {
            return;
        }

        AlgoFeedback::record($user, 'restock', [
            'kind' => 'readded', 'name' => $item->name, 'class' => $class,
            'final_number' => (int) $previous->created_at->diffInDays(now()),
            'outcome' => $previous->outcome,
        ]);
    }

    private const AUTOFILL_FIELDS = ['weight', 'calories', 'shelf_life_days', 'nutrition_category'];

    private static function autofillKey(User $user, Item $item): string
    {
        return "autofill-proposal:{$user->id}:{$item->id}";
    }

    /**
     * What Autofill offered, per field. The card is review-then-confirm and "Dismiss" makes no
     * request, so the offer is remembered briefly and matched against the next PATCH that
     * carries one of these fields (autofillApplied); proposed minus applied = dismissed.
     *
     * @param  array<string, mixed>  $fields
     */
    public static function autofillProposed(User $user, Item $item, array $fields, string $categorySource): void
    {
        $proposal = array_intersect_key($fields, array_flip(self::AUTOFILL_FIELDS));
        if ($proposal === []) {
            return;
        }

        Cache::put(self::autofillKey($user, $item), $proposal, now()->addMinutes(30));
        $class = FoodGroupClassifier::classify($item->name, $item->icon);
        foreach ($proposal as $field => $value) {
            AlgoFeedback::record($user, 'autofill', [
                'kind' => 'proposed', 'name' => $item->name, 'class' => $class,
                'guess' => $field === 'nutrition_category' ? (string) $value : $field,
                'guess_number' => $field === 'nutrition_category' ? null : (float) $value,
                'source' => $field === 'nutrition_category' ? $categorySource : 'ai',
            ]);
        }
    }

    /** @param  array<string, mixed>  $patch */
    public static function autofillApplied(User $user, Item $item, array $patch): void
    {
        $key = self::autofillKey($user, $item);
        $proposal = Cache::get($key);
        if (! is_array($proposal) || array_intersect_key($proposal, $patch) === []) {
            return;
        }

        Cache::forget($key);
        $class = FoodGroupClassifier::classify($item->name, $item->icon);
        foreach (array_intersect_key($proposal, $patch) as $field => $value) {
            $same = $field === 'nutrition_category' ? $patch[$field] === $value : (float) $patch[$field] === (float) $value;
            AlgoFeedback::record($user, 'autofill', [
                'kind' => 'applied', 'name' => $item->name, 'class' => $class,
                'guess' => $field === 'nutrition_category' ? (string) $value : $field,
                'guess_number' => $field === 'nutrition_category' ? null : (float) $value,
                'final_number' => $field === 'nutrition_category' || $patch[$field] === null ? null : (float) $patch[$field],
                'source' => 'card', 'outcome' => $same ? 'accepted' : 'changed',
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
