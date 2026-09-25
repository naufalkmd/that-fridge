<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_outcomes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('original_item_id');
            $table->string('name_key', 60)->nullable();
            $table->string('outcome', 24);
            $table->string('corrected_from', 24)->nullable();
            $table->string('confidence', 12);
            $table->string('context', 24)->nullable();
            $table->integer('predicted_days')->nullable();
            $table->integer('actual_days')->nullable();
            $table->json('snapshot')->nullable();
            $table->json('usage_delta')->nullable();
            $table->boolean('badge_counted')->default(false);
            $table->timestamp('undone_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_outcomes');
    }
};
