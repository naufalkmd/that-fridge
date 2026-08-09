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
        Schema::table('notification_prefs', function (Blueprint $table) {
            $table->boolean('crew_actions_enabled')->default(false)->after('weekly_digest');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('notification_prefs', function (Blueprint $table) {
            $table->dropColumn('crew_actions_enabled');
        });
    }
};
