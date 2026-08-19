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
        Schema::create('fridge_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fridge_id')->constrained()->cascadeOnDelete();
            // nullOnDelete, not cascade - a note should survive its author leaving/being
            // removed from the fridge, same as it survives long after they wrote it.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('text', 500);
            $table->string('color');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fridge_notes');
    }
};
