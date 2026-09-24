<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The failing step's error text was already captured per-run in machine_runs.error, but
 * reading "why did the last run fail" off a Machine meant a second query. Denormalized here
 * alongside last_run_status, the same pattern that column already uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('machines', function (Blueprint $table) {
            $table->text('last_run_error')->nullable()->after('last_run_status');
        });
    }

    public function down(): void
    {
        Schema::table('machines', function (Blueprint $table) {
            $table->dropColumn('last_run_error');
        });
    }
};
