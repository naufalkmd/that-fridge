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
            // Korea PIPA wants explicit, separate consent for cross-border transfer of
            // personal data (chat text + photos -> OpenRouter in the US) - distinct from
            // general Terms/Privacy acceptance. Set once, server-side, at registration; never
            // client-supplied as a timestamp (only a boolean triggers `now()`) so it can't be
            // backdated.
            $table->timestamp('data_transfer_consented_at')->nullable()->after('email_verified_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('data_transfer_consented_at');
        });
    }
};
