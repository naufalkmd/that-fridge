<?php

namespace Tests\Unit;

use App\Support\FoodGroupClassifier;
use PHPUnit\Framework\TestCase;

class FoodGroupClassifierTest extends TestCase
{
    // ---- specific-term precedence --------------------------------------------------------

    public function test_peanut_butter_is_protein_not_dairy(): void
    {
        // The backlog's own example: "butter" alone means dairy, but "peanut butter" is a
        // specific compound term that should win over that shorter keyword.
        $this->assertSame('protein', FoodGroupClassifier::classify('Peanut butter'));
    }

    public function test_almond_butter_is_protein_not_dairy(): void
    {
        $this->assertSame('protein', FoodGroupClassifier::classify('Almond butter'));
    }

    public function test_plain_butter_is_still_dairy(): void
    {
        $this->assertSame('dairy', FoodGroupClassifier::classify('Unsalted butter'));
    }

    public function test_ice_cream_is_other_extras_not_dairy(): void
    {
        $this->assertSame('other_extras', FoodGroupClassifier::classify('Vanilla ice cream'));
    }

    public function test_oat_milk_is_other_extras_not_dairy_or_grains(): void
    {
        $this->assertSame('other_extras', FoodGroupClassifier::classify('Oat milk'));
    }

    public function test_plain_milk_is_still_dairy(): void
    {
        $this->assertSame('dairy', FoodGroupClassifier::classify('Whole milk'));
    }

    public function test_green_beans_is_vegetables_not_protein(): void
    {
        $this->assertSame('vegetables', FoodGroupClassifier::classify('Green beans'));
        $this->assertSame('vegetables', FoodGroupClassifier::classify('Green bean'));
    }

    public function test_plain_beans_is_still_protein(): void
    {
        $this->assertSame('protein', FoodGroupClassifier::classify('Black beans'));
    }

    // ---- word-boundary handling ------------------------------------------------------------

    public function test_short_keyword_does_not_match_inside_an_unrelated_longer_word(): void
    {
        // "pea" is a vegetables keyword; "peanut" must not match it as a substring. "peanut"
        // alone (no butter) is its own protein keyword, so this also confirms it resolves to
        // the *correct* group, not just "not vegetables".
        $this->assertSame('protein', FoodGroupClassifier::classify('Peanuts'));
    }

    public function test_regular_plural_still_matches_via_the_optional_suffix(): void
    {
        $this->assertSame('grains', FoodGroupClassifier::classify('Oats'));
        $this->assertSame('vegetables', FoodGroupClassifier::classify('Onions'));
    }

    public function test_irregular_plural_matches_its_own_listed_form(): void
    {
        $this->assertSame('fruit', FoodGroupClassifier::classify('Strawberries'));
    }

    // ---- icon corpus fallback (last resort, after this class's own precise layers) --------

    public function test_falls_back_to_the_icon_corpus_for_names_not_in_the_supplementary_list(): void
    {
        // "avocado" isn't in FoodGroupClassifier's own KEYWORDS - only the icon corpus
        // (FoodIconKeywords icon59) knows it.
        $this->assertSame('other_extras', FoodGroupClassifier::classify('Avocado'));
    }

    public function test_own_keyword_wins_over_a_looser_icon_corpus_match(): void
    {
        // The icon corpus's icon23 maps the generic word "whole" (meant to distinguish two
        // chicken icons) to protein via plain substring matching - "Whole milk" must not
        // inherit that, since this class's own word-boundary-safe "milk" keyword is checked
        // first and correctly says dairy.
        $this->assertSame('dairy', FoodGroupClassifier::classify('Whole milk'));
    }

    public function test_known_icon_key_is_used_directly_over_a_generic_name(): void
    {
        // A name with no classifiable keyword of its own, but a real, already-assigned icon.
        $this->assertSame('dairy', FoodGroupClassifier::classify('Trader Joes Wedge', 'cheese'));
    }

    // ---- unclassifiable -----------------------------------------------------------------

    public function test_returns_null_when_nothing_matches(): void
    {
        $this->assertNull(FoodGroupClassifier::classify('Xyzzy Widget 9000'));
    }

    public function test_returns_null_for_an_empty_name(): void
    {
        $this->assertNull(FoodGroupClassifier::classify('   '));
    }
}
