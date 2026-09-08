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
        // Explicit create (not User::factory()) so this seeder runs on a production box
        // where fakerphp/faker — a require-dev package — isn't installed. updateOrCreate
        // keyed on email keeps re-runs idempotent.
        // Demo/reviewer accounts. The password is never committed — set DEMO_USER_PASSWORD in
        // the server .env (it's in a shared password manager) and re-run `db:seed --force` to
        // rotate it. The 'password123' fallback is for local dev only, where these boxes are
        // throwaway. Keira is the App Review demo account (see apps/mobile/STORE_LISTING.md §5).
        // Guard against silently reseeding the old public 'password123' onto prod. `env()` is
        // read here (not config()) so it works right after `config:clear` during a rotation.
        if (app()->environment('production') && empty(env('DEMO_USER_PASSWORD'))) {
            throw new \RuntimeException(
                'Set DEMO_USER_PASSWORD in .env before seeding in production '
                .'(then: php artisan config:clear && php artisan db:seed --force).'
            );
        }
        $demoPassword = env('DEMO_USER_PASSWORD', 'password123');
        foreach ([
            ['name' => 'Keira', 'email' => 'keira@thatfridge.test', 'username' => 'keira'],
            ['name' => 'Hazim', 'email' => 'hazim@thatfridge.test', 'username' => 'hazim'],
            ['name' => 'Joey', 'email' => 'joey@thatfridge.test', 'username' => 'joey'],
            ['name' => 'Kemed', 'email' => 'kemed@thatfridge.test', 'username' => 'kemed'],
        ] as $attrs) {
            User::updateOrCreate(
                ['email' => $attrs['email']],
                [...$attrs, 'password' => $demoPassword, 'email_verified_at' => now(), 'is_demo' => true, 'ai_credits' => 9999],
            );
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
        ] as $recipe) {
            Recipe::updateOrCreate(
                ['user_id' => null, 'name' => $recipe['name']],
                $recipe
            );
        }
    }
}
