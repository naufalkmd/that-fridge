<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Shared rules for an item's weight/calories/custom_fields, used by both ItemController (a
 * form that resends the whole payload) and AgentToolbox's update_item tool (a single
 * natural-language edit that must not clobber fields it wasn't told about) - one place for
 * the weight/unit pairing invariant and the custom-field merge logic, rather than two.
 */
final class ItemPayload
{
    // Metric mass/volume plus imperial - mirrors ItemController's Rule::in validation.
    public const WEIGHT_UNITS = ['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb'];

    public const MAX_CUSTOM_FIELDS = 20;

    public const MAX_LABEL_LENGTH = 40;

    public const MAX_VALUE_LENGTH = 255;

    /**
     * Two rules validation alone can't express: clearing `weight` must clear `weight_unit`
     * too, and custom_fields entries need a stable id - the client omits it for a brand-new
     * row, so one is assigned here rather than trusting the client to invent one.
     */
    public static function normalize(array $data): array
    {
        if (array_key_exists('weight', $data) && $data['weight'] === null) {
            $data['weight_unit'] = null;
        }

        if (isset($data['custom_fields'])) {
            $data['custom_fields'] = array_values(array_map(fn ($field) => [
                'id' => $field['id'] ?? (string) Str::uuid(),
                'label' => trim($field['label']),
                'value' => trim($field['value'] ?? ''),
            ], $data['custom_fields']));
        }

        return $data;
    }

    /**
     * Applies a set of {label, value} edits onto an item's existing custom_fields array,
     * matching by trimmed, case-insensitive label: a match updates the value and keeps the
     * field's id, an empty value removes the field, no match appends a new field with a
     * fresh uuid. Returns an error string (never a partial write) if the result would
     * violate the same limits ItemController validates.
     *
     * @param  array<int, array{id?: string, label: string, value: string}>  $existing
     * @param  array<int, array{label: string, value: string}>  $edits
     * @return array<int, array{id: string, label: string, value: string}>|string
     */
    public static function mergeCustomFields(array $existing, array $edits): array|string
    {
        $fields = $existing;

        foreach ($edits as $edit) {
            $label = trim((string) ($edit['label'] ?? ''));
            if ($label === '') {
                return 'each custom field needs a label.';
            }
            if (Str::length($label) > self::MAX_LABEL_LENGTH) {
                return "custom field label \"{$label}\" is too long (max ".self::MAX_LABEL_LENGTH.' characters).';
            }

            $value = trim((string) ($edit['value'] ?? ''));
            if (Str::length($value) > self::MAX_VALUE_LENGTH) {
                return "value for \"{$label}\" is too long (max ".self::MAX_VALUE_LENGTH.' characters).';
            }

            $matchIndex = null;
            foreach ($fields as $i => $field) {
                if (Str::lower(trim((string) ($field['label'] ?? ''))) === Str::lower($label)) {
                    $matchIndex = $i;
                    break;
                }
            }

            if ($matchIndex !== null) {
                if ($value === '') {
                    array_splice($fields, $matchIndex, 1);
                } else {
                    // Keep the field's existing label casing on a case-insensitive match -
                    // an edit for "batch code" shouldn't silently rename a stored "Batch code".
                    $fields[$matchIndex]['value'] = $value;
                }
            } elseif ($value !== '') {
                $fields[] = ['id' => (string) Str::uuid(), 'label' => $label, 'value' => $value];
            }
        }

        if (count($fields) > self::MAX_CUSTOM_FIELDS) {
            return 'that would leave more than '.self::MAX_CUSTOM_FIELDS.' custom fields on this item.';
        }

        return array_values($fields);
    }
}
