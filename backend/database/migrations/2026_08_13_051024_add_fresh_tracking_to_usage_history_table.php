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
            // Supports the "items rescued" / "average freshness at use" goal metrics. All
            // default to 0 so existing rows just read as "no data yet" - count stays the
            // all-time total of items used up; these track the subset of that where we know
            // the item was still within its date (fresh_use_count) and its freshness value at
            // the moment it was recorded (freshness_sum / freshness_sample_count, for a
            // weighted average - not every usage carries a freshness value, since not every
            // item has an expiry_date set).
            $table->unsignedInteger('fresh_use_count')->default(0)->after('count');
            $table->unsignedInteger('freshness_sum')->default(0)->after('fresh_use_count');
            $table->unsignedInteger('freshness_sample_count')->default(0)->after('freshness_sum');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('usage_history', function (Blueprint $table) {
            $table->dropColumn(['fresh_use_count', 'freshness_sum', 'freshness_sample_count']);
        });
    }
};
