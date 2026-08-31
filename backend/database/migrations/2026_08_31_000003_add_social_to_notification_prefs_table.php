<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Invitations, join requests, approvals, and people joining/leaving a shared fridge.
     * On by default - these are directed at you personally and rare, unlike the ambient
     * expiry/stock stream.
     */
    public function up(): void
    {
        Schema::table('notification_prefs', function (Blueprint $table) {
            $table->boolean('social')->default(true)->after('crew_actions_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('notification_prefs', function (Blueprint $table) {
            $table->dropColumn('social');
        });
    }
};
