<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('shop_url')->nullable();
        });

        Schema::table('shopping_items', function (Blueprint $table) {
            $table->string('shop_url')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('shop_url');
        });

        Schema::table('shopping_items', function (Blueprint $table) {
            $table->dropColumn('shop_url');
        });
    }
};
