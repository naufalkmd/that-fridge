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
        Schema::table('users', function (Blueprint $table) {
            // Synced from RevenueCat webhooks (RevenueCatWebhookController), not set directly
            // anywhere else. "Is this user Pro right now" is just `pro_expires_at` being null
            // or in the past - one field, always trust the latest webhook's expiration_at_ms
            // rather than branching on event type (self-correcting, idempotent).
            $table->timestamp('pro_expires_at')->nullable()->after('data_transfer_consented_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pro_expires_at');
        });
    }
};
