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
        Schema::table('fridge_join_requests', function (Blueprint $table) {
            // 'requester' (someone asked to join) or 'owner' (the fridge owner invited them) -
            // decides which side approve()/decline() authorizes. Every existing row is
            // genuinely requester-initiated, hence the default rather than a backfill.
            $table->string('initiated_by')->default('requester');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fridge_join_requests', function (Blueprint $table) {
            $table->dropColumn('initiated_by');
        });
    }
};
