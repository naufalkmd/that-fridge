<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Events used to be purely fridge-scoped (everyone in the fridge sees "milk expires
     * today"). Activity/invite notifications are addressed to one person - an invite reaches
     * you before you're a member of that fridge, so the feed can't find it by membership.
     * A non-null user_id means "this event is for this user specifically".
     */
    public function up(): void
    {
        Schema::table('notification_events', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('fridge_id')->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notification_events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
