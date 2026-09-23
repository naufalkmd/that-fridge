<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            // Triage state for the admin panel's Feedback inbox - 'new' until someone deals with it.
            $table->string('status')->default('new')->index()->after('message');
            $table->text('admin_note')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn(['status', 'admin_note']);
        });
    }
};
