<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Whether a stocked item covers a recipe ingredient - the server's copy of the app-wide rule in
 * packages/core/src/recipeMatch.ts, so what-to-eat agrees with the app's Tonight's pick and Chef's
 * plan: the same food by name (plurals and extra words allowed: "eggs" = "egg", "milk" = "whole
 * milk"), or the same *specific* icon. Fallback icons never match: unrelated unknowns share them.
 */
final class IngredientMatch
{
    /** Icons that mean "no particular food". */
    public const NON_SPECIFIC_ICONS = ['', 'generic', 'leftovers'];

    /** Mirrors normalizeItemName in packages/core/src/domain.ts. */
    public static function normalize(string $name): string
    {
        $s = preg_replace('/\s+/', ' ', Str::lower(trim($name))) ?? '';
        if (str_ends_with($s, 'ies') && strlen($s) > 4) {
            return substr($s, 0, -3).'y';
        }
        if (str_ends_with($s, 'es') && strlen($s) > 4) {
            return substr($s, 0, -2);
        }
        if (str_ends_with($s, 's') && ! str_ends_with($s, 'ss') && strlen($s) > 3) {
            return substr($s, 0, -1);
        }

        return $s;
    }

    public static function sameFood(string $a, string $b): bool
    {
        $na = self::normalize($a);
        $nb = self::normalize($b);
        if ($na === '' || $nb === '') {
            return false;
        }
        if ($na === $nb) {
            return true;
        }
        $wa = self::words($a);
        $wb = self::words($b);
        [$short, $long] = count($wa) <= count($wb) ? [$wa, $wb] : [$wb, $wa];
        if ($short === [] || ! collect($short)->contains(fn ($w) => strlen($w) >= 3)) {
            return false;
        }
        $longSet = array_flip(array_map([self::class, 'normalize'], $long));

        return collect($short)->every(fn ($w) => isset($longSet[self::normalize($w)]));
    }

    /** @param array{name: string, icon?: ?string} $ingredient */
    public static function covers(string $itemName, ?string $itemIcon, array $ingredient): bool
    {
        if (self::sameFood($itemName, (string) ($ingredient['name'] ?? ''))) {
            return true;
        }
        $icon = (string) ($ingredient['icon'] ?? '');

        return ! in_array($icon, self::NON_SPECIFIC_ICONS, true) && $itemIcon === $icon;
    }

    /** @return list<string> */
    private static function words(string $s): array
    {
        return array_values(array_filter(preg_split('/[^a-z0-9]+/', self::normalize($s)) ?: []));
    }
}
