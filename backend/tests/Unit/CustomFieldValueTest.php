<?php

namespace Tests\Unit;

use App\Support\CustomFieldValue;
use App\Support\NutrientTable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class CustomFieldValueTest extends TestCase
{
    /** @return array<string, array{0: mixed, 1: ?float}> */
    public static function numbers(): array
    {
        return [
            'bare' => ['25', 25.0], 'decimal' => ['12.5', 12.5], 'unit' => ['25 g', 25.0], 'glued unit' => ['25g', 25.0],
            'thousands' => ['1,200 mg', 1200.0], 'percent' => ['12%', 12.0], 'padded' => ['  7 kcal ', 7.0], 'negative' => ['-3', -3.0],
            'text' => ['high', null], 'empty' => ['', null], 'null' => [null, null], 'number then words' => ['about 25 g', null],
            'range' => ['20-30 g', null], 'unit with digits' => ['25 g2', null],
        ];
    }

    #[DataProvider('numbers')]
    public function test_it_reads_the_number_out_of_what_users_type(mixed $value, ?float $expected): void
    {
        $this->assertSame($expected, CustomFieldValue::number($value));
    }

    public function test_it_reads_the_unit(): void
    {
        $this->assertSame('g', CustomFieldValue::unit('25 g'));
        $this->assertSame('mg', CustomFieldValue::unit('1,200mg'));
        $this->assertNull(CustomFieldValue::unit('25'));
        $this->assertNull(CustomFieldValue::unit('high'));
    }

    public function test_it_recognises_nutrient_labels_however_they_are_written(): void
    {
        foreach (['Protein', 'protein (g)', 'Total Protein', 'Proteins'] as $label) {
            $this->assertSame('protein', CustomFieldValue::nutrient($label), $label);
        }
        $this->assertSame('carbs', CustomFieldValue::nutrient('Carbs'));
        $this->assertSame('carbs', CustomFieldValue::nutrient('Carbohydrates (g)'));
        $this->assertSame('fat', CustomFieldValue::nutrient('Total fat'));
        $this->assertSame('fiber', CustomFieldValue::nutrient('Fibre'));
        $this->assertSame('sugar', CustomFieldValue::nutrient('Sugars'));
        $this->assertNull(CustomFieldValue::nutrient('Supplier'));
        $this->assertNull(CustomFieldValue::nutrient('Saturated fat')); // not the same thing as fat
    }

    public function test_the_label_may_state_the_unit(): void
    {
        $this->assertSame('g', CustomFieldValue::labelUnit('Protein (g)'));
        $this->assertSame('mg', CustomFieldValue::labelUnit('Sodium [mg]'));
        $this->assertNull(CustomFieldValue::labelUnit('Protein'));
    }

    public function test_labels_only_the_user_can_know_are_flagged(): void
    {
        foreach (['Price', 'Brand', 'Batch code', 'Purchased from', 'Bought on', 'Best before date', 'Notes', 'Barcode', 'Supplier store'] as $label) {
            $this->assertTrue(CustomFieldValue::unknowable($label), $label);
        }
        foreach (['Protein', 'Fat', 'Origin', 'Flavour', 'Vitamin C'] as $label) {
            $this->assertFalse(CustomFieldValue::unknowable($label), $label);
        }
    }

    public function test_labels_compare_without_case_or_padding(): void
    {
        $this->assertTrue(CustomFieldValue::sameLabel(' Protein ', 'protein'));
        $this->assertFalse(CustomFieldValue::sameLabel('Protein', 'Proteins'));
    }

    public function test_it_formats_in_the_users_style(): void
    {
        $this->assertSame('25 g', CustomFieldValue::format(25.0, 'g', false));
        $this->assertSame('25', CustomFieldValue::format(25.0, 'g', true));
        $this->assertSame('3.5 g', CustomFieldValue::format(3.46, 'g', false));
        $this->assertSame('120', CustomFieldValue::format(119.6, null, false));
    }

    public function test_the_nutrient_table_only_answers_for_a_plain_known_food(): void
    {
        $chicken = NutrientTable::per100('Fresh chicken breast');
        $this->assertEqualsWithDelta(31.0, $chicken['protein'], 0.01);
        $this->assertEqualsWithDelta(3.6, $chicken['fat'], 0.01);
        $this->assertEqualsWithDelta(3.4, NutrientTable::per100('Whole milk')['protein'], 0.01);
        $this->assertEqualsWithDelta(12.6, NutrientTable::per100('Eggs')['protein'], 0.01);
        $this->assertEqualsWithDelta(12.6, NutrientTable::per100('Organic Free Range Eggs')['protein'], 0.01);

        $this->assertNull(NutrientTable::per100('Chicken rice'));      // a dish: two foods
        $this->assertNull(NutrientTable::per100('Heinz baked beans')); // a branded product
        $this->assertNull(NutrientTable::per100('Low fat milk'));      // changes the fat and sugar
        $this->assertNull(NutrientTable::per100('Mystery sauce'));
        $this->assertNull(NutrientTable::per100(''));
    }

    public function test_the_longest_keyword_wins(): void
    {
        $this->assertEqualsWithDelta(31.0, NutrientTable::per100('chicken breast')['protein'], 0.01); // not plain "chicken" (27)
        $this->assertEqualsWithDelta(1.6, NutrientTable::per100('sweet potato')['protein'], 0.01);   // not "potato" (2)
    }
}
