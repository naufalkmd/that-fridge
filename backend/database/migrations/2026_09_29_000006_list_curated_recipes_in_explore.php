<?php

use App\Models\ExploreItem;
use App\Models\Recipe;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Str;

/**
 * Curated recipes leave everyone's recipe book and live in Explore, so every one of them needs an
 * Explore entry. Adds a published entry for any curated recipe without one (the same fields
 * app:seed-explore uses); entries an admin already has - featured, hidden, reordered - are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Recipe::query()->whereNull('user_id')->whereDoesntHave('exploreItems')->each(function (Recipe $recipe) {
            ExploreItem::create([
                'type' => 'recipe',
                'ref_id' => $recipe->id,
                'title' => Str::limit($recipe->name, 120, ''),
                'blurb' => collect([$recipe->minutes ? "{$recipe->minutes} min" : null, $recipe->category])->filter()->implode(' · ') ?: null,
                'tags' => array_values(array_filter([$recipe->category, 'recipe'])),
                'status' => 'published',
            ]);
        });
    }

    public function down(): void
    {
        // Leave the entries: removing them would empty Explore's recipe library.
    }
};
