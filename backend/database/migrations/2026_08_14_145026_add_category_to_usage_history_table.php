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
        Schema::table('usage_history', function (Blueprint $table) {
            // The nutrition category the item had the most recent time it was used - same
            // "overwritten on every upsert" treatment as the existing name/icon columns on
            // this table (not aggregated like the freshness_* counters), since this only ever
            // needs to answer "what category was this most recently."
            $table->string('category')->nullable()->after('icon');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('usage_history', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
