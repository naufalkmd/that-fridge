<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rollback support (Phase 3 "action undo and audit details") - a run can be undone at most
 * once. `steps_run` already carries each step's own `undo` payload (added inside its existing
 * JSON column, no schema change needed there) - this timestamp is just the guard against
 * undoing the same run twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('machine_runs', function (Blueprint $table) {
            $table->timestamp('undone_at')->nullable()->after('error');
        });
    }

    public function down(): void
    {
        Schema::table('machine_runs', function (Blueprint $table) {
            $table->dropColumn('undone_at');
        });
    }
};
