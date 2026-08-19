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
        Schema::create('fridge_join_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fridge_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requester_id')->constrained('users')->cascadeOnDelete();
            // Plain string, not a DB enum, matching fridge_members.role's precedent.
            $table->string('status')->default('pending');
            $table->timestamps();

            // One row per (fridge, requester) - a re-request after a decline flips this same
            // row back to pending (see FridgeJoinRequestController::store) rather than piling
            // up duplicate rows for the same pair.
            $table->unique(['fridge_id', 'requester_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fridge_join_requests');
    }
};
