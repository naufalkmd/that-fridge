<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The Explore page's catalogue: one row per thing shown in a library (a food icon, a recipe, a Kitchen
     * Lab Machine template, a meal-plan template). Icons and recipes point at their own row through
     * `ref_id`; Machines and meal plans carry their content in `payload`. Admin decides what is featured,
     * the order and what is hidden. Seeded once from what already exists so Explore is not empty on day one.
     */
    public function up(): void
    {
        Schema::create('explore_items', function (Blueprint $table) {
            $table->id();
            $table->string('type', 16)->index();          // icon | recipe | machine | meal_plan
            $table->unsignedBigInteger('ref_id')->nullable();
            $table->json('payload')->nullable();
            $table->string('title', 120);
            $table->string('blurb')->nullable();
            $table->json('tags')->nullable();
            $table->boolean('featured')->default(false);
            $table->unsignedInteger('position')->default(0);
            $table->string('status', 12)->default('published')->index(); // draft | published | hidden
            $table->timestamps();

            $table->unique(['type', 'ref_id']);
        });

        try {
            Artisan::call('app:seed-explore');
        } catch (Throwable $e) {
            // Never block a deploy on seeding; the command can be run by hand.
            report($e);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('explore_items');
    }
};
