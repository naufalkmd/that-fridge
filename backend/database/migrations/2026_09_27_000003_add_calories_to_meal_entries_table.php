<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Calories for one planned / logged meal. `calories_source` says where it came from: `recipe`
     * (the recipe's per-serving estimate), `estimate` (worked out from the meal's name), or `manual`
     * (typed by the user, never overwritten). Null when nothing could be worked out.
     */
    public function up(): void
    {
        Schema::table('meal_entries', function (Blueprint $table) {
            $table->unsignedSmallInteger('calories')->nullable()->after('note');
            $table->string('calories_source', 10)->nullable()->after('calories');
        });
    }

    public function down(): void
    {
        Schema::table('meal_entries', function (Blueprint $table) {
            $table->dropColumn(['calories', 'calories_source']);
        });
    }
};
