<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\FoodGroupClassifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FoodGroupControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_files_names_by_the_server_rules_and_cached_answers_for_free(): void
    {
        $user = User::factory()->create(['ai_credits' => 5]);
        FoodGroupClassifier::remember('Kaya', 'other_extras'); // an earlier AI answer for this name

        $this->actingAs($user)->postJson('/api/food-groups/classify', ['items' => [
            ['name' => 'Chicken thighs', 'icon' => 'generic'],
            ['name' => 'Kaya'],
            ['name' => 'Zxqv', 'icon' => null],
        ]])->assertOk()->assertJson(['groups' => ['protein', 'other_extras', null]]);

        $this->assertSame(5, $user->fresh()->ai_credits);
    }
}
