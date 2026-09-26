<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Admin-granted Pro ("comped"), separate from the RevenueCat-owned `pro_expires_at` so a
     * webhook can never overwrite it, and separate from `is_demo` (which only isolates an
     * account from real users). Until now every demo account was implicitly Pro, so existing
     * demo accounts are backfilled to keep exactly the access they have today.
     * Never set from a user request (not in User's #[Fillable]); only the admin panel writes it.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('pro_granted')->default(false)->after('is_demo');
        });

        DB::table('users')->where('is_demo', true)->update(['pro_granted' => true]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pro_granted');
        });
    }
};
