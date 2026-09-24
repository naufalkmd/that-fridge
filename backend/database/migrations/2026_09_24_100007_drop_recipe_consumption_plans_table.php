<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recipe consumption plans (set_recipe_consumption_plan / mark_recipe_made auto-decrement)
 * are removed - that capability belongs to Kitchen Lab now, not a chat-only, per-recipe
 * feature with no in-app editor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('recipe_consumption_plans');
    }

    public function down(): void
    {
        Schema::create('recipe_consumption_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('recipe_id')->constrained()->cascadeOnDelete();
            $table->json('plan');
            $table->timestamps();

            $table->unique(['user_id', 'recipe_id']);
        });
    }
};
