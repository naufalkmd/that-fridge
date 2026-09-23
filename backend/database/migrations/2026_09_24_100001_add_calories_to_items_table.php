<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optional total kcal for the item as stored (not per-100g, not per-serving) - kept
     * deliberately separate from nutrition_category, which is a food-group tag, not a
     * macro/nutrition value (see the comment on NutritionCategory in packages/core).
     * Settable manually, via AI estimate, or by scanning a nutrition label photo.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->unsignedInteger('calories')->nullable()->after('weight_unit');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('calories');
        });
    }
};
