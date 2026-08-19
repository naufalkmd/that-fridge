<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->nullable()->unique()->after('name');
        });

        // Backfill: existing accounts predate usernames entirely - generate one from their
        // name so search/profile lookups work for everyone, not just new signups.
        DB::table('users')->whereNull('username')->select('id', 'name')->orderBy('id')->each(function ($user) {
            DB::table('users')->where('id', $user->id)->update(['username' => $this->generateUniqueUsername($user->name)]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('username');
        });
    }

    private function generateUniqueUsername(string $name): string
    {
        $slug = Str::lower(preg_replace('/[^a-z0-9]/i', '', $name));
        if ($slug === '') {
            $slug = 'user';
        }

        $candidate = $slug;
        $suffix = 1;
        while (DB::table('users')->where('username', $candidate)->exists()) {
            $suffix++;
            $candidate = $slug.$suffix;
        }

        return $candidate;
    }
};
