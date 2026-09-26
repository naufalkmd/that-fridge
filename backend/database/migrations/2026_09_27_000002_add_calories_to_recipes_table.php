<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Calories per serving for every recipe, computed by the app (never typed in): `algorithm` from
     * the built-in nutrition table when it recognises enough ingredients, `ai` when the model had to
     * step in, `rough` for the stop-gap number shown until it does. Not in Recipe's #[Fillable].
     * Existing recipes get the algorithm pass right here; the nightly sweeper (and the queue job
     * for new recipes) hands the ones it could not cover to the model.
     */
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->unsignedSmallInteger('calories')->nullable()->after('minutes');
            $table->string('calories_source', 12)->nullable()->after('calories');
        });

        try {
            Artisan::call('app:fill-recipe-calories', ['--no-ai' => true, '--limit' => 100000]);
        } catch (Throwable $e) {
            // Never block a deploy on a backfill; the nightly sweeper picks up whatever is left.
            report($e);
        }
    }

    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->dropColumn(['calories', 'calories_source']);
        });
    }
};
