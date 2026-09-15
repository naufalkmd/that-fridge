<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RevenueCat doesn't guarantee webhook delivery order. Without tracking the last event we
 * actually applied, a stale/out-of-order redelivery of an older event could overwrite
 * `pro_expires_at` with older data than what's already there. Stored as the raw ms
 * timestamp (not a Carbon column) so comparisons match RevenueCat's own units exactly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('revenuecat_last_event_ms')->nullable()->after('pro_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('revenuecat_last_event_ms');
        });
    }
};
