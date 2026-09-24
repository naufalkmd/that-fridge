<?php

namespace Tests\Unit;

use App\Support\FoodIconMatcher;
use PHPUnit\Framework\TestCase;

class FoodIconMatcherTest extends TestCase
{
    public function test_matches_a_curated_keyword(): void
    {
        $this->assertSame('cheese', FoodIconMatcher::guess('Cheddar cheese'));
    }

    public function test_matches_a_generated_pack_keyword_not_in_the_curated_ten(): void
    {
        // "tuna" only exists in the generated pack (icon2), never in the 10 curated entries.
        $this->assertSame('icon2', FoodIconMatcher::guess('Tuna'));
    }

    public function test_longest_keyword_wins(): void
    {
        // "eggplant" contains "egg" (curated, len 3) but should match the longer, more
        // specific "eggplant" keyword from the generated pack instead.
        $result = FoodIconMatcher::guess('Eggplant');
        $this->assertNotSame('eggs', $result);
    }

    public function test_returns_null_when_nothing_matches(): void
    {
        $this->assertNull(FoodIconMatcher::guess('Xyzzy Widget 9000'));
    }

    public function test_returns_null_for_an_empty_name(): void
    {
        $this->assertNull(FoodIconMatcher::guess('   '));
    }

    public function test_nutrition_category_resolves_for_a_curated_match(): void
    {
        $this->assertSame('dairy', FoodIconMatcher::nutritionCategoryFor('cheese'));
    }

    public function test_nutrition_category_resolves_for_a_generated_match(): void
    {
        $this->assertSame('protein', FoodIconMatcher::nutritionCategoryFor('icon2'));
    }

    public function test_nutrition_category_is_null_for_an_unknown_key(): void
    {
        $this->assertNull(FoodIconMatcher::nutritionCategoryFor('not-a-real-key'));
        $this->assertNull(FoodIconMatcher::nutritionCategoryFor(null));
    }
}
