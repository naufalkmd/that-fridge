<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Reading and writing the free-text values of an item's custom fields ("Protein" = "25 g"). Users type whatever
 * they like, so numbers may carry a unit ("25 g", "1,200 mg", "12%"); everything that adds fields up (Machine
 * thresholds, sum_item_field, Quick Chat) reads them through here so "25 g" counts as 25 instead of being skipped.
 */
final class CustomFieldValue
{
    /** Nutrients we can work out from a food name and its weight, by the words a user is likely to label them with. */
    private const NUTRIENT_LABELS = [
        'protein' => '/^(?:total\s+)?proteins?\b/i',
        'carbs' => '/^(?:total\s+)?(?:carbs?|carbohydrates?)\b/i',
        'fat' => '/^(?:total\s+)?fats?\b/i',
        'fiber' => '/^(?:dietary\s+)?fib(?:er|re)\b/i',
        'sugar' => '/^(?:total\s+)?sugars?\b/i',
    ];

    /** Labels that are personal or unknowable from a food's name: never guessed, never sent to a model. */
    private const UNKNOWABLE = '/\b(?:brand|price|cost|paid|store|shop|supplier|barcode|sku|batch|lot|serial|code|purchase[d]?|bought|receipt|gift|owner|who|when|date|note|notes|comment|location)\b/i';

    /** The number in "25", "25.5", "25 g", "1,200 mg", "12%" - null when the value is text or has no leading number. */
    public static function number(mixed $value): ?float
    {
        $text = trim((string) $value);
        if ($text === '') {
            return null;
        }
        if (is_numeric($text)) {
            return (float) $text;
        }
        if (preg_match('/^([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([\p{L}%µ\/.]*(?:\s?[\p{L}\/.]+)?)$/u', $text, $m)) {
            return (float) str_replace(',', '', $m[1]);
        }

        return null;
    }

    /** The unit written after the number ("g" in "25 g"), or null for a bare number or plain text. */
    public static function unit(mixed $value): ?string
    {
        if (preg_match('/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*([\p{L}%µ\/.]+)\s*$/u', trim((string) $value), $m)) {
            return $m[1];
        }

        return null;
    }

    /** protein | carbs | fat | fiber | sugar when the label names one of them, else null. */
    public static function nutrient(string $label): ?string
    {
        $clean = trim(preg_replace('/\s*[\(\[].*?[\)\]]\s*/u', ' ', $label) ?? $label);
        foreach (self::NUTRIENT_LABELS as $key => $pattern) {
            if (preg_match($pattern, $clean)) {
                return $key;
            }
        }

        return null;
    }

    /** "Protein (g)" -> "g"; null when the label states no unit. */
    public static function labelUnit(string $label): ?string
    {
        return preg_match('/[\(\[]\s*([\p{L}%µ\/.]+)\s*[\)\]]/u', $label, $m) ? $m[1] : null;
    }

    /** True for labels that say something only the user knows (a price, a brand, a batch code, a date). */
    public static function unknowable(string $label): bool
    {
        return (bool) preg_match(self::UNKNOWABLE, $label);
    }

    /** Case- and space-insensitive label comparison. */
    public static function sameLabel(string $a, string $b): bool
    {
        return Str::lower(trim($a)) === Str::lower(trim($b));
    }

    /** "25 g" / "25" / "25 mg" from a number, in the unit and style the user already writes. */
    public static function format(float $number, ?string $unit, bool $bare): string
    {
        $rendered = number_format($number, $number < 10 ? 1 : 0, '.', '');
        if (str_contains($rendered, '.')) {
            $rendered = rtrim(rtrim($rendered, '0'), '.'); // "3.50" -> "3.5", "3.0" -> "3"; never touch "120"
        }

        return $bare || $unit === null || $unit === '' ? $rendered : "{$rendered} {$unit}";
    }
}
