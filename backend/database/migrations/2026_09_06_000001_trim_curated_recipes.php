<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The curated (user_id null) starter set was 7 recipes — too many strangers in a
 * brand-new user's book. Trim to 3 (Veggie Stir-Fry, Veggie Omelet, Leftover Fried
 * Rice); the seeder now only defines those. This drops the other 4 from databases
 * that were already seeded. recipe_favorites cascades on recipe delete, so no orphans.
 */
return new class extends Migration
{
    private array $removed = [
        'Creamy Veggie Soup',
        'Berry Oat Bowl',
        'Bean & Veggie Bowl',
        'Apple Crumble',
    ];

    public function up(): void
    {
        DB::table('recipes')
            ->whereNull('user_id')
            ->whereIn('name', $this->removed)
            ->delete();
    }

    public function down(): void
    {
        // The seeder is the source of truth for curated recipes; re-run `db:seed`
        // to restore any set. Nothing to do here.
    }
};
