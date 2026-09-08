<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a Pro subscription is in its free-trial period, we withhold the 400-credit monthly
 * bundle (the trial user keeps their free-tier balance) until it converts to a paid renewal.
 * This records when the trial ends so the monthly grant command can tell a trial subscriber
 * from a paying one - `pro_expires_at` alone can't, it's a future date in both cases.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('pro_trial_until')->nullable()->after('ai_credits');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pro_trial_until');
        });
    }
};
