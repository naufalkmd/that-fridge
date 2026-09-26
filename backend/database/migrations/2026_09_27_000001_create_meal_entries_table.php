<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The meal plan and recipe log: a planned meal on a day, or (status "cooked") a logged one.
     * `user_id` is the author. With a `fridge_id`, other members of that fridge see and edit the
     * entry only while the fridge's owner is Pro (see MealEntry::scopeVisibleTo); otherwise it is
     * the author's own. `slot` is the user's own free label ("Dinner", "Meal prep"), never an enum.
     */
    public function up(): void
    {
        Schema::create('meal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // A deleted fridge leaves the entry with its author as a personal entry.
            $table->foreignId('fridge_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->string('slot', 40);
            $table->string('time', 5)->nullable(); // HH:MM, only for a reminder
            // A deleted recipe keeps the entry: `title` is copied at save time.
            $table->foreignId('recipe_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 120);
            $table->string('note', 255)->nullable();
            $table->string('status', 10)->default('planned'); // planned | cooked | skipped
            $table->timestamp('cooked_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'date']);
            $table->index(['fridge_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meal_entries');
    }
};
