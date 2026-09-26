<?php

namespace App\Services;

use App\Models\Item;
use App\Models\User;
use App\Support\CustomFieldValue;
use App\Support\NutrientTable;
use Illuminate\Support\Str;

/**
 * Fills an item's EMPTY custom fields ("Protein", "Fat", ...) for the item page's Autofill, cheapest reliable source first:
 *
 *  1. History  - the user already filled that label on another item with the same name and the same weight: reuse it.
 *  2. Table    - a nutrient label (protein, carbs, fat, fibre, sugar) on a plain food with a known weight: per-100 g figures
 *                scaled to the item's weight (NutrientTable). Deterministic and free.
 *  3. Model    - everything else worth guessing goes to the one AI call the autofill already makes, together with the user's own
 *                earlier entries for those labels so it matches their units and style.
 *
 * Labels that only the user can know (price, brand, batch code, a date) are never guessed. Nothing here ever overwrites a
 * value; it only proposes values for blanks.
 */
class CustomFieldAutofill
{
    /** At most this many empty fields are worked on in one go. */
    public const MAX_FIELDS = 8;

    private const GRAMS = ['g' => 1, 'kg' => 1000, 'mg' => 0.001, 'oz' => 28.3495, 'lb' => 453.592, 'ml' => 1, 'l' => 1000];

    /**
     * @return array{filled: array<string, array{value: string, source: string}>, ask: list<string>, examples: list<string>}
     *                                                                                                                       filled: label => proposed value and where it came from; ask: labels left for the model; examples: the user's own earlier entries for those labels
     */
    public function resolve(User $user, Item $item): array
    {
        $empty = collect($item->custom_fields ?? [])
            ->filter(fn ($f) => trim((string) ($f['value'] ?? '')) === '' && trim((string) ($f['label'] ?? '')) !== '')
            ->pluck('label')->map(fn ($l) => trim((string) $l))->unique(fn ($l) => Str::lower($l))
            ->reject(fn ($l) => CustomFieldValue::unknowable($l))
            ->take(self::MAX_FIELDS)->values();

        if ($empty->isEmpty()) {
            return ['filled' => [], 'ask' => [], 'examples' => []];
        }

        $siblings = $this->siblings($user, $item);
        $filled = [];
        $ask = [];

        foreach ($empty as $label) {
            $entries = $this->entriesFor($siblings, $label);
            $bare = $this->prefersBareNumbers($label, $entries);
            $unit = CustomFieldValue::labelUnit($label) ?? $this->commonUnit($entries) ?? 'g';

            $reused = $this->reuse($item, $entries);
            if ($reused !== null) {
                $filled[$label] = ['value' => $reused, 'source' => 'history'];

                continue;
            }

            $computed = $this->fromTable($item, $label, $unit, $bare);
            if ($computed !== null) {
                $filled[$label] = ['value' => $computed, 'source' => 'table'];

                continue;
            }

            $ask[] = $label;
        }

        return ['filled' => $filled, 'ask' => $ask, 'examples' => $this->examples($siblings, $ask)];
    }

    /** The user's other items (any fridge they belong to) that carry at least one filled custom field. */
    private function siblings(User $user, Item $item)
    {
        return Item::query()
            ->whereHas('section', fn ($q) => $q->whereIn('fridge_id', $user->memberFridges()->pluck('fridges.id')))
            ->whereKeyNot($item->id)
            ->whereNotNull('custom_fields')
            ->latest()->limit(300)->get();
    }

    /** @return list<array{item: Item, value: string}> */
    private function entriesFor($siblings, string $label): array
    {
        $out = [];
        foreach ($siblings as $sibling) {
            foreach ($sibling->custom_fields ?? [] as $field) {
                $value = trim((string) ($field['value'] ?? ''));
                if ($value !== '' && CustomFieldValue::sameLabel((string) ($field['label'] ?? ''), $label)) {
                    $out[] = ['item' => $sibling, 'value' => $value];
                }
            }
        }

        return $out;
    }

    /** Same name, same weight (or both without one): the value carries over as it is. */
    private function reuse(Item $item, array $entries): ?string
    {
        foreach ($entries as $entry) {
            $other = $entry['item'];
            $sameName = Str::lower(trim($other->name)) === Str::lower(trim($item->name));
            $sameWeight = $other->weight === null && $item->weight === null
                || ($other->weight !== null && $item->weight !== null && $other->weight_unit === $item->weight_unit && abs($other->weight - $item->weight) < 0.001);
            if ($sameName && $sameWeight) {
                return $entry['value'];
            }
        }

        return null;
    }

    /** A protein / carbs / fat / fibre / sugar label on a plain food with a known weight. */
    private function fromTable(Item $item, string $label, string $unit, bool $bare): ?string
    {
        $nutrient = CustomFieldValue::nutrient($label);
        if ($nutrient === null || $item->weight === null || ! isset(self::GRAMS[$item->weight_unit ?? ''])) {
            return null;
        }
        $per100 = NutrientTable::per100($item->name);
        if ($per100 === null) {
            return null;
        }

        $grams = (float) $item->weight * self::GRAMS[$item->weight_unit];
        $amount = $per100[$nutrient] * $grams / 100; // for ONE unit as stored, like the calories
        $inUnit = match (Str::lower($unit)) {
            'mg' => $amount * 1000,
            'kg' => $amount / 1000,
            default => $amount,
        };

        return CustomFieldValue::format($inUnit, $unit, $bare);
    }

    /** The user writes bare numbers for this label ("12") when its unit is in the label or most of their entries have none. */
    private function prefersBareNumbers(string $label, array $entries): bool
    {
        if (CustomFieldValue::labelUnit($label) !== null) {
            return true;
        }
        $numeric = array_filter($entries, fn ($e) => CustomFieldValue::number($e['value']) !== null);
        if ($numeric === []) {
            return false;
        }
        $bare = array_filter($numeric, fn ($e) => CustomFieldValue::unit($e['value']) === null);

        return count($bare) * 2 > count($numeric);
    }

    /** The unit most of the user's entries for this label use. */
    private function commonUnit(array $entries): ?string
    {
        $units = array_count_values(array_filter(array_map(fn ($e) => CustomFieldValue::unit($e['value']), $entries)));
        arsort($units);

        return $units === [] ? null : (string) array_key_first($units);
    }

    /**
     * A few of the user's own entries for the labels the model has to guess, e.g. "Pasta (500 g, grains) - Protein: 17 g".
     *
     * @param  list<string>  $labels
     * @return list<string>
     */
    private function examples($siblings, array $labels): array
    {
        $lines = [];
        foreach ($labels as $label) {
            foreach (array_slice($this->entriesFor($siblings, $label), 0, 3) as $entry) {
                $other = $entry['item'];
                $weight = $other->weight !== null ? ", {$other->weight} {$other->weight_unit}" : '';
                $lines[] = "{$other->name} (qty {$other->quantity}{$weight}) - {$label}: ".Str::limit($entry['value'], 40, '');
            }
        }

        return $lines;
    }
}
