<?php

namespace Tests\Unit;

use App\Support\ItemPayload;
use Tests\TestCase;

class ItemPayloadTest extends TestCase
{
    public function test_normalize_clears_weight_unit_when_weight_is_explicitly_nulled(): void
    {
        $data = ItemPayload::normalize(['weight' => null, 'name' => 'Milk']);

        $this->assertArrayHasKey('weight_unit', $data);
        $this->assertNull($data['weight_unit']);
    }

    public function test_normalize_leaves_weight_unit_alone_when_weight_isnt_present(): void
    {
        $data = ItemPayload::normalize(['name' => 'Milk']);

        $this->assertArrayNotHasKey('weight_unit', $data);
    }

    public function test_normalize_assigns_uuids_to_custom_fields_missing_one(): void
    {
        $data = ItemPayload::normalize(['custom_fields' => [
            ['label' => ' Batch code ', 'value' => ' L4471-09 '],
        ]]);

        $this->assertNotEmpty($data['custom_fields'][0]['id']);
        $this->assertSame('Batch code', $data['custom_fields'][0]['label']);
        $this->assertSame('L4471-09', $data['custom_fields'][0]['value']);
    }

    public function test_normalize_preserves_a_supplied_custom_field_id(): void
    {
        $data = ItemPayload::normalize(['custom_fields' => [
            ['id' => 'keep-me', 'label' => 'Batch code', 'value' => 'L4471-09'],
        ]]);

        $this->assertSame('keep-me', $data['custom_fields'][0]['id']);
    }

    public function test_merge_custom_fields_updates_an_existing_field_by_case_insensitive_label(): void
    {
        $existing = [['id' => 'a', 'label' => 'Batch code', 'value' => 'L4471-09']];

        $merged = ItemPayload::mergeCustomFields($existing, [['label' => 'batch code', 'value' => 'L4471-10']]);

        $this->assertIsArray($merged);
        $this->assertCount(1, $merged);
        $this->assertSame('a', $merged[0]['id']);
        $this->assertSame('Batch code', $merged[0]['label'], 'the stored label casing should be kept, not overwritten by the edit');
        $this->assertSame('L4471-10', $merged[0]['value']);
    }

    public function test_merge_custom_fields_does_not_clobber_fields_not_mentioned_in_the_edit(): void
    {
        $existing = [
            ['id' => 'a', 'label' => 'Batch code', 'value' => 'L4471-09'],
            ['id' => 'b', 'label' => 'Supplier', 'value' => 'Metro'],
        ];

        $merged = ItemPayload::mergeCustomFields($existing, [['label' => 'Batch code', 'value' => 'L4471-10']]);

        $byLabel = collect($merged)->keyBy('label');
        $this->assertSame('L4471-10', $byLabel['Batch code']['value']);
        $this->assertSame('Metro', $byLabel['Supplier']['value']);
    }

    public function test_merge_custom_fields_appends_a_new_field_with_a_fresh_uuid(): void
    {
        $merged = ItemPayload::mergeCustomFields([], [['label' => 'Batch code', 'value' => 'L4471-09']]);

        $this->assertCount(1, $merged);
        $this->assertNotEmpty($merged[0]['id']);
    }

    public function test_merge_custom_fields_removes_a_field_on_an_empty_value(): void
    {
        $existing = [['id' => 'a', 'label' => 'Batch code', 'value' => 'L4471-09']];

        $merged = ItemPayload::mergeCustomFields($existing, [['label' => 'Batch code', 'value' => '']]);

        $this->assertSame([], $merged);
    }

    public function test_merge_custom_fields_ignores_removing_a_field_that_doesnt_exist(): void
    {
        $merged = ItemPayload::mergeCustomFields([], [['label' => 'Batch code', 'value' => '']]);

        $this->assertSame([], $merged);
    }

    public function test_merge_custom_fields_rejects_more_than_twenty_fields(): void
    {
        $edits = array_map(fn ($i) => ['label' => "Field {$i}", 'value' => 'x'], range(1, 21));

        $result = ItemPayload::mergeCustomFields([], $edits);

        $this->assertIsString($result);
    }

    public function test_merge_custom_fields_rejects_a_label_over_forty_characters(): void
    {
        $result = ItemPayload::mergeCustomFields([], [['label' => str_repeat('a', 41), 'value' => 'x']]);

        $this->assertIsString($result);
    }

    public function test_merge_custom_fields_rejects_a_value_over_255_characters(): void
    {
        $result = ItemPayload::mergeCustomFields([], [['label' => 'Note', 'value' => str_repeat('a', 256)]]);

        $this->assertIsString($result);
    }

    public function test_merge_custom_fields_rejects_an_empty_label(): void
    {
        $result = ItemPayload::mergeCustomFields([], [['label' => '  ', 'value' => 'x']]);

        $this->assertIsString($result);
    }
}
