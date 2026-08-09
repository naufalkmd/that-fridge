<?php

namespace Database\Seeders;

use App\Models\Recipe;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        foreach ([
            ['name' => 'Keira', 'email' => 'keira@thatfridge.test'],
            ['name' => 'Hazim', 'email' => 'hazim@thatfridge.test'],
            ['name' => 'Joey', 'email' => 'joey@thatfridge.test'],
            ['name' => 'Kemed', 'email' => 'kemed@thatfridge.test'],
        ] as $attrs) {
            User::factory()->create([
                ...$attrs,
                'password' => 'password123',
            ]);
        }

        $this->seedCuratedRecipes();
    }

    /**
     * The starter recipe set every user sees (user_id null = curated, not tied to one
     * account). Previously these lived only in the frontend's data.ts as a hardcoded mock
     * with no backend at all; keyed by name so re-running `db:seed` stays idempotent.
     */
    private function seedCuratedRecipes(): void
    {
        foreach ([
            [
                'name' => 'Veggie Stir-Fry',
                'minutes' => 20,
                'category' => 'dinner',
                'ingredients' => [
                    ['icon' => 'carrot', 'name' => 'Carrots'],
                    ['icon' => 'spinach', 'name' => 'Spinach'],
                    ['icon' => 'eggs', 'name' => 'Eggs'],
                    ['icon' => 'meat', 'name' => 'Chicken or beef'],
                ],
                'steps' => [
                    'Heat oil in a wok over high heat.',
                    'Add carrots and stir-fry 2 minutes.',
                    'Add spinach and protein, cook until done.',
                    'Season with soy sauce and serve over rice.',
                ],
            ],
            [
                'name' => 'Creamy Veggie Soup',
                'minutes' => 30,
                'category' => 'dinner',
                'ingredients' => [
                    ['icon' => 'spinach', 'name' => 'Spinach'],
                    ['icon' => 'carrot', 'name' => 'Carrots'],
                    ['icon' => 'cheese', 'name' => 'Cheese'],
                    ['icon' => 'milk', 'name' => 'Milk'],
                ],
                'steps' => [
                    'Sauté carrots until soft.',
                    'Add spinach and cook until wilted.',
                    'Pour in milk and simmer.',
                    'Stir in cheese until melted and creamy.',
                ],
            ],
            [
                'name' => 'Veggie Omelet',
                'minutes' => 12,
                'category' => 'breakfast',
                'ingredients' => [
                    ['icon' => 'eggs', 'name' => 'Eggs'],
                    ['icon' => 'cheese', 'name' => 'Cheese'],
                    ['icon' => 'spinach', 'name' => 'Spinach'],
                ],
                'steps' => [
                    'Whisk eggs in a bowl.',
                    'Pour into a hot buttered pan.',
                    'Add spinach and cheese, fold once set.',
                    'Cook until golden and serve.',
                ],
            ],
            [
                'name' => 'Berry Oat Bowl',
                'minutes' => 8,
                'category' => 'breakfast',
                'ingredients' => [
                    ['icon' => 'berries', 'name' => 'Berries'],
                    ['icon' => 'yogurt', 'name' => 'Yogurt'],
                    ['icon' => 'milk', 'name' => 'Milk'],
                ],
                'steps' => [
                    'Combine oats and milk, let sit 5 minutes.',
                    'Top with yogurt.',
                    'Finish with fresh berries.',
                ],
            ],
            [
                'name' => 'Leftover Fried Rice',
                'minutes' => 15,
                'category' => 'quick',
                'ingredients' => [
                    ['icon' => 'leftovers', 'name' => 'Leftovers'],
                    ['icon' => 'eggs', 'name' => 'Eggs'],
                    ['icon' => 'carrot', 'name' => 'Carrots'],
                ],
                'steps' => [
                    'Scramble eggs in a hot pan, set aside.',
                    'Stir-fry carrots for 2 minutes.',
                    'Add chopped leftovers and rice, toss well.',
                    'Fold in eggs and season to taste.',
                ],
            ],
            [
                'name' => 'Bean & Veggie Bowl',
                'minutes' => 25,
                'category' => 'dinner',
                // 'icon126' is the food-icons manifest entry that the frontend's guessIcon()
                // already resolves any "beans" item name to (see frontend/lib/thatfridge/data.ts)
                // - reusing it here is what lets this recipe recognize beans a user actually owns.
                'ingredients' => [
                    ['icon' => 'icon126', 'name' => 'Beans'],
                    ['icon' => 'carrot', 'name' => 'Carrots'],
                    ['icon' => 'spinach', 'name' => 'Spinach'],
                    ['icon' => 'cheese', 'name' => 'Cheese'],
                ],
                'steps' => [
                    'Rinse and drain the beans.',
                    'Sauté carrots until just tender.',
                    'Stir in spinach and beans, warm through.',
                    'Top with cheese and serve.',
                ],
            ],
            [
                'name' => 'Apple Crumble',
                'minutes' => 35,
                'category' => 'dessert',
                'ingredients' => [
                    ['icon' => 'apple', 'name' => 'Apples'],
                    ['icon' => 'cheese', 'name' => 'Butter'],
                    ['icon' => 'milk', 'name' => 'Milk'],
                ],
                'steps' => [
                    'Slice apples into a baking dish.',
                    'Rub butter into a crumble topping.',
                    'Scatter topping over apples.',
                    'Bake until golden, serve with milk.',
                ],
            ],
        ] as $recipe) {
            Recipe::updateOrCreate(
                ['user_id' => null, 'name' => $recipe['name']],
                $recipe
            );
        }
    }
}
