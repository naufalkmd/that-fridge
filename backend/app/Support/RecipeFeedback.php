<?php

namespace App\Support;

use App\Models\Recipe;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Recipe suggestion quality: where the recipe the user actually cooked ranked in the last list
 * we showed them. Filters are the fixed vibe/food-focus enums - nothing user-typed.
 */
final class RecipeFeedback
{
    private static function key(User $user): string
    {
        return "recipe-suggestions:{$user->id}";
    }

    /** @param  array<int, int|string>  $orderedIds  exact matches first, then similar */
    public static function suggested(User $user, array $orderedIds, array $vibes, array $foodFocus, ?string $mealType): void
    {
        if ($orderedIds === []) {
            return;
        }

        Cache::put(self::key($user), array_map('intval', $orderedIds), now()->addHours(6));
        sort($vibes);
        AlgoFeedback::record($user, 'recipe', [
            'kind' => 'suggested', 'class' => $mealType,
            'guess' => Str::limit(implode('+', $vibes), 120, ''),
            'guess_number' => count($orderedIds),
            'source' => $vibes !== [] || $foodFocus !== [] ? 'criteria' : 'browse',
        ]);
    }

    public static function made(User $user, Recipe $recipe): void
    {
        $ids = Cache::pull(self::key($user));
        $rank = is_array($ids) ? array_search((int) $recipe->id, $ids, true) : false;

        AlgoFeedback::record($user, 'recipe', [
            'kind' => 'made',
            'guess_number' => is_array($ids) ? count($ids) : null,
            'final_number' => $rank === false ? null : $rank + 1,
            'source' => $rank === false ? 'not_suggested' : 'suggested',
            'outcome' => $rank === false ? 'unranked' : 'ranked',
        ]);
    }
}
