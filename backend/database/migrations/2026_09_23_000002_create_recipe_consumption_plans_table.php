<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A deterministic, user-defined plan for what happens to inventory when a recipe is marked
 * made - see AgentToolbox::setRecipeConsumptionPlan/markRecipeMade. Keyed by (user_id,
 * recipe_id) rather than living as a column on `recipes`, because a curated recipe (user_id
 * null on `recipes`) is shared across every account, but the plan references specific
 * inventory item ids - which are always per-user. Two different users marking the same
 * curated recipe made need two different plans pointing at their own items.
 */
return new class extends Migration
{
    public function up(): void
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

    public function down(): void
    {
        Schema::dropIfExists('recipe_consumption_plans');
    }
};
