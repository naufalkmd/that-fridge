<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Without this, ItemResource's "opened items go bad in 3 days" cap had no anchor: it
     * recomputed `min(realDaysLeft, 3)` fresh on every request, so an item with more than 3
     * days of real shelf life left froze at "3 days left" indefinitely instead of counting
     * down from the moment it was opened.
     */
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->timestamp('opened_at')->nullable()->after('opened');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('opened_at');
        });
    }
};
