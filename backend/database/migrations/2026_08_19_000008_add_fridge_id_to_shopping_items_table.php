<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('shopping_items', function (Blueprint $table) {
            // Nullable at the DB level - doctrine/dbal (needed for ->change() to make this
            // NOT NULL after backfilling) isn't installed in this project. The application
            // always populates it going forward (see ShoppingItemController::store(), which
            // takes the fridge from the route, not the request body).
            $table->foreignId('fridge_id')->nullable()->after('user_id')->constrained()->cascadeOnDelete();
        });

        // Backfill: each existing item -> its adder's oldest owned fridge, the closest
        // server-side equivalent to "their primary fridge" ("active fridge" is a frontend-only
        // concept). An item whose adder owns no fridge at all (only possible for someone who
        // used Shopping before ever adding a fridge item) has nothing sensible to backfill to.
        DB::table('shopping_items')->orderBy('id')->get(['id', 'user_id'])->each(function ($item) {
            $fridgeId = DB::table('fridges')->where('user_id', $item->user_id)->oldest('id')->value('id');
            if ($fridgeId) {
                DB::table('shopping_items')->where('id', $item->id)->update(['fridge_id' => $fridgeId]);
            } else {
                DB::table('shopping_items')->where('id', $item->id)->delete();
            }
        });

        Schema::table('shopping_items', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropColumn('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('shopping_items', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
        });

        DB::table('shopping_items')->orderBy('id')->get(['id', 'fridge_id'])->each(function ($item) {
            $ownerId = DB::table('fridges')->where('id', $item->fridge_id)->value('user_id');
            if ($ownerId) {
                DB::table('shopping_items')->where('id', $item->id)->update(['user_id' => $ownerId]);
            }
        });

        Schema::table('shopping_items', function (Blueprint $table) {
            $table->dropForeign(['fridge_id']);
            $table->dropColumn('fridge_id');
        });
    }
};
