<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sign in with Apple / Google. A user who only ever used a social login has no password,
     * so it becomes nullable. oauth_provider/oauth_sub is the stable per-provider identity
     * (Apple/Google's `sub` claim); the unique index is what a repeat social login matches on.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->change();
            $table->string('oauth_provider')->nullable()->after('password');
            $table->string('oauth_sub')->nullable()->after('oauth_provider');
            $table->unique(['oauth_provider', 'oauth_sub']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['oauth_provider', 'oauth_sub']);
            $table->dropColumn(['oauth_provider', 'oauth_sub']);
            $table->string('password')->nullable(false)->change();
        });
    }
};
