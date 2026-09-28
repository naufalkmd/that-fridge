<?php

namespace App\Support;

use App\Models\Recipe;

/**
 * What a recipe looks like in the app, for the admin: its AI icon, else the pack icon for the
 * recipe (or its first ingredient), else the pack's guess from the recipe name - the same order
 * the app's FoodIcon uses. Null means the app shows initials.
 */
final class RecipeIcons
{
    public static function imageUrl(?Recipe $recipe): ?string
    {
        if ($recipe === null) {
            return null;
        }
        if ($recipe->icon_url) {
            return $recipe->icon_url;
        }
        $key = $recipe->icon ?: (($recipe->ingredients[0]['icon'] ?? null) ?: 'leftovers');

        return FoodIconMatcher::imageUrl($key) ?? FoodIconMatcher::imageUrl(FoodIconMatcher::guess((string) $recipe->name));
    }

    /** The recipe's photo (imported recipes carry one), if any. */
    public static function photoUrl(?Recipe $recipe): ?string
    {
        foreach ($recipe?->attachments ?? [] as $a) {
            if (($a['type'] ?? null) === 'image' && ! empty($a['url'])) {
                return (string) $a['url'];
            }
        }

        return null;
    }
}
