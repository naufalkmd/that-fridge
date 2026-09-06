<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Free-form per-user preference tags — the coarse onboarding answers ("what brings you
 * here", "who's it for", waste frequency) plus room for anything else that flavours copy.
 * JSON rather than columns so the question set can change without a migration each time.
 * See apps/mobile/PRE_SIGNUP_ONBOARDING.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('preferences')->nullable()->after('data_transfer_consented_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('preferences');
        });
    }
};
