<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes shaped around the admin dashboard's actual queries (date-range counts and the
 * funnel's name IN (...) AND created_at >= ?).
 *
 * Plain CREATE INDEX is fine at today's table sizes. Once analytics_events / ai_credit_ledger
 * are large, new Postgres indexes on them should use CREATE INDEX CONCURRENTLY in a migration
 * with $withinTransaction = false, so building them doesn't block app writes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('analytics_events', function (Blueprint $table) {
            $table->index(['name', 'created_at']);   // funnel + auth-method split
            $table->index('created_at');             // list date filter, pruning
            // Redundant now: (name, created_at) serves every lookup by name on its own.
            $table->dropIndex(['name']);
        });

        Schema::table('ai_credit_ledger', function (Blueprint $table) {
            $table->index(['created_at', 'reason']); // credit spend by feature
        });

        Schema::table('users', function (Blueprint $table) {
            $table->index('created_at');     // signup counts / chart, default list sort
            $table->index('last_active_on'); // active-7d count, inactive filter
        });

        Schema::table('chat_history', function (Blueprint $table) {
            $table->index('created_at');
        });

        Schema::table('generated_icons', function (Blueprint $table) {
            $table->index('created_at');
        });

        // One pack entry per generated icon - IconCurator::promote already guarantees it;
        // this makes the database enforce it (and backs GeneratedIcon::sharedIcon lookups).
        Schema::table('shared_icons', function (Blueprint $table) {
            $table->unique('source_generated_icon_id');
        });
    }

    public function down(): void
    {
        Schema::table('shared_icons', function (Blueprint $table) {
            $table->dropUnique(['source_generated_icon_id']);
        });
        Schema::table('generated_icons', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });
        Schema::table('chat_history', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['last_active_on']);
        });
        Schema::table('ai_credit_ledger', function (Blueprint $table) {
            $table->dropIndex(['created_at', 'reason']);
        });
        Schema::table('analytics_events', function (Blueprint $table) {
            $table->index('name');
            $table->dropIndex(['name', 'created_at']);
            $table->dropIndex(['created_at']);
        });
    }
};
