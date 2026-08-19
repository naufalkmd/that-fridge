<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('fridge_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fridge_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('member');
            $table->timestamps();

            $table->unique(['fridge_id', 'user_id']);
        });

        // Backfill: every existing fridge's owner becomes an 'owner' member row, so
        // membership-based authorization doesn't lock existing owners out of their own
        // fridges the moment the policies switch over (see Fridge::booted() for how every
        // fridge created from here on gets this row automatically).
        $now = now();
        DB::table('fridges')->select('id', 'user_id')->orderBy('id')->get()->each(function ($fridge) use ($now) {
            DB::table('fridge_members')->insert([
                'fridge_id' => $fridge->id,
                'user_id' => $fridge->user_id,
                'role' => 'owner',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fridge_members');
    }
};
