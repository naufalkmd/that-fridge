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
        Schema::table('items', function (Blueprint $table) {
            // One of: protein, vegetables, fruit, grains, dairy, other_extras - freeform
            // validated string (same treatment as icon/location), not a DB enum, so the
            // allowed set can change without a migration. Nullable: items added before this
            // feature (or ones the icon-based guess can't place) simply have none yet.
            $table->string('nutrition_category')->nullable()->after('icon');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('nutrition_category');
        });
    }
};
