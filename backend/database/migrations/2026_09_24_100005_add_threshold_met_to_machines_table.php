<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Threshold-trigger edge detection needs to know whether the condition was already met on the
 * last check, so it fires once on the not-met -> met transition and doesn't re-fire on every
 * subsequent write while still met. Null means "never checked, or just edited" - deliberately
 * distinct from false, so a freshly (re)configured threshold doesn't inherit stale state from
 * before the edit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('machines', function (Blueprint $table) {
            $table->boolean('threshold_met')->nullable()->after('trigger_config');
        });
    }

    public function down(): void
    {
        Schema::table('machines', function (Blueprint $table) {
            $table->dropColumn('threshold_met');
        });
    }
};
