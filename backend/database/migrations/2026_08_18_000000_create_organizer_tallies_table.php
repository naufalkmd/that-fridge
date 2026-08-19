<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizer_tallies', function (Blueprint $table) {
            $table->id();
            // One row per user (singleton, same convention as user_goals) - firstOrCreate gives
            // every user a zeroed row the first time this is read, before Organizer has ever run.
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('items_checked_total')->default(0);
            $table->unsignedInteger('items_correct_total')->default(0);
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizer_tallies');
    }
};
