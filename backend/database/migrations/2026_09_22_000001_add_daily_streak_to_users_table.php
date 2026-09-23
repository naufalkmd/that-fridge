<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replaces the old weekly Waste-Saver-score streak with a daily "opened the app" streak -
 * see User::recordDailyOpen(). `last_active_on` is a plain date (not datetime) since only
 * the calendar day matters for the consecutive-day check.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('current_streak')->default(0)->after('ai_credits');
            $table->date('last_active_on')->nullable()->after('current_streak');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['current_streak', 'last_active_on']);
        });
    }
};
