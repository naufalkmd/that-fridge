<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only log of name / username edits (AuthController::updateProfile). It's the
     * source of truth for the rolling-window rate limit - a real user can fix a typo but
     * can't churn a handle (squatting, impersonation, breaking the social graph) - and
     * doubles as a support / abuse trail so a freed username can be traced to who held it.
     */
    public function up(): void
    {
        Schema::create('user_profile_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('field'); // 'name' | 'username'
            $table->string('old_value')->nullable();
            $table->string('new_value');
            $table->timestamp('created_at')->nullable();

            // The rate-limit query: rows for one user + field newer than the window start.
            $table->index(['user_id', 'field', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_profile_changes');
    }
};
