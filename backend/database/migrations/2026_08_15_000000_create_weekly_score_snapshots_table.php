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
        Schema::create('weekly_score_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Monday of the ISO week this snapshot covers - one row per user per week,
            // upserted in place by app:snapshot-kitchen-scores (re-running mid-week updates
            // rather than duplicating).
            $table->date('week_of');
            $table->unsignedInteger('waste_score');
            // Nullable - Food Balance can legitimately be "not enough data yet" the same way
            // computeFoodBalanceScore's live version returns score: null.
            $table->unsignedInteger('balance_score')->nullable();
            // Backs the zero_waste_week badge check without recomputing overdue items later.
            $table->unsignedInteger('overdue_count')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'week_of']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('weekly_score_snapshots');
    }
};
