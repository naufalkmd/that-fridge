<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Opened but not finished" — an item the user has started using. Stays in the fridge;
     * ItemResource caps its effective `days` at 3 so an opened item is treated as going bad
     * sooner. Set from the item-detail "Opened it" action and from "Mark as made" → Remaining.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('opened')->default(false)->after('shelf_life_days');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('opened');
        });
    }
};
