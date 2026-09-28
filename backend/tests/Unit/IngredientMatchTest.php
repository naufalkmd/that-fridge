<?php

namespace Tests\Unit;

use App\Support\IngredientMatch;
use PHPUnit\Framework\TestCase;

/** Same cases as the app's recipeMatch tests, so the two copies of the rule stay in step. */
class IngredientMatchTest extends TestCase
{
    public function test_same_food_by_name_with_plurals_and_extra_words(): void
    {
        $this->assertTrue(IngredientMatch::sameFood('Eggs', 'egg'));
        $this->assertTrue(IngredientMatch::sameFood('Milk', 'Whole milk'));
        $this->assertTrue(IngredientMatch::sameFood('Berries', 'berry'));
        $this->assertFalse(IngredientMatch::sameFood('Oat milk', 'Almond milk'));
        $this->assertFalse(IngredientMatch::sameFood('Ox', 'Ox tail'));
    }

    public function test_a_shared_specific_icon_matches_but_a_fallback_never_does(): void
    {
        $this->assertTrue(IngredientMatch::covers('Cheddar', 'cheese', ['name' => 'Cheese', 'icon' => 'cheese']));
        $this->assertFalse(IngredientMatch::covers('Leftover soup', 'leftovers', ['name' => 'Galangal', 'icon' => 'leftovers']));
        $this->assertFalse(IngredientMatch::covers('Mystery', 'generic', ['name' => 'Tamarind', 'icon' => 'generic']));
    }
}
