<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optional weight/volume for an item, e.g. "500 g" or "12.75 oz". decimal(10,3) rather
     * than float so mg-to-multi-kg values round-trip exactly instead of drifting. Always set
     * (or cleared) together with weight_unit - see ItemController::normalizeItemPayload(),
     * which nulls weight_unit whenever weight is explicitly cleared.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->decimal('weight', 10, 3)->nullable()->after('quantity');
            $table->string('weight_unit', 8)->nullable()->after('weight');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['weight', 'weight_unit']);
        });
    }
};
