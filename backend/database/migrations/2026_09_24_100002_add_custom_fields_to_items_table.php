<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * User-defined label/value pairs on an item, e.g. "Batch code" → "L4471-09". JSON rather
 * than a child table - this codebase's existing pattern for open-ended per-record data (see
 * users.preferences, user_memories.facts) - since the shape is arbitrary and there's no
 * querying need. Shape: [{"id": uuid, "label": string, "value": string}, ...], documented
 * on the Item model. The whole array is replaced on every PATCH /items/{item}.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->json('custom_fields')->nullable()->after('shop_url');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('custom_fields');
        });
    }
};
