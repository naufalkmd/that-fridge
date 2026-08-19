<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Invite-code joining is discarded in favor of username search + request-to-join (see
     * FridgeJoinRequestController) - nothing reads this column anymore.
     */
    public function up(): void
    {
        Schema::table('fridges', function (Blueprint $table) {
            // SQLite errors dropping a column that still has a unique index on it - drop the
            // index first (MySQL/Postgres drop it implicitly with the column either way, so
            // this line is a no-op there, not just an SQLite-specific branch).
            $table->dropUnique('fridges_invite_code_unique');
            $table->dropColumn('invite_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fridges', function (Blueprint $table) {
            $table->string('invite_code')->nullable()->unique()->after('style');
        });
    }
};
