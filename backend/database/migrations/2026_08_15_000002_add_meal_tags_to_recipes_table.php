<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            // AI-inferred once at save time (see AgentService::tagRecipe), separate from the
            // user-chosen `category` column above - meal_type answers "which meal slot" for the
            // What Should I Eat filter, category is the user's own organizational tag shown in
            // Food Hub's filter chips. Different taxonomies, deliberately not merged.
            $table->string('meal_type')->nullable()->after('category');
            $table->json('vibes')->nullable()->after('meal_type');
            $table->json('food_focus')->nullable()->after('vibes');
            // Incremented by POST /recipes/{recipe}/mark-made - backs the something_new vibe.
            $table->unsignedInteger('made_count')->default(0)->after('food_focus');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->dropColumn(['meal_type', 'vibes', 'food_focus', 'made_count']);
        });
    }
};
