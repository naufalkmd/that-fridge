<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marks the seeded demo / App Review accounts (DatabaseSeeder). Demo accounts and real
     * users are mutually invisible in Find-a-friend (UserController::search / profile) so
     * real users don't turn up @keira / @hazim / @joey / @kemed and fire join requests into
     * the void - while the demo accounts can still find each other to test sharing.
     * Never set from a user request (not in User's #[Fillable]).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_demo')->default(false)->after('email_verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_demo');
        });
    }
};
