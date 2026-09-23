<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kitchen Lab "Machine" - a user-defined automation with a trigger and a fixed, editable
 * list of steps, authored once with AI help (see CreditCost::MACHINE_BUILD) but replayed
 * with zero AI involved afterward: same steps, same output, every time it fires. A step is
 * one AgentToolbox tool call - see AgentToolbox::MACHINE_TOOLS for which tools a Machine may
 * use, and the class docblock for why the rest are excluded.
 *
 * This migration only creates the table a Machine's definition lives in. The scheduler that
 * finds due Machines and the executor that actually replays `steps` are separate, not-yet-
 * built pieces (see the item-detail/Kitchen Lab planning notes) - `next_run_at` etc. are
 * reserved for that follow-up, not read by anything yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('machines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The fridge a Machine's writes/notifications target by default, and the Fridge
            // Notifier::notify() requires - a Machine belongs to exactly one fridge.
            $table->foreignId('fridge_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            // The sentence the Machine was authored from, if any - kept so the user can
            // sanity-check the steps against what they originally asked for.
            $table->text('prompt')->nullable();
            $table->string('trigger_type', 20); // schedule | item_added | threshold
            $table->json('trigger_config');
            $table->json('steps'); // [{"tool": "...", "args": {...}}, ...]
            $table->boolean('enabled')->default(false);
            // Bumped on any edit to `steps` - an audit trail for "what actually ran" once a
            // Machine has a run history, distinct from `updated_at` which also moves on
            // renames/trigger tweaks that don't change what a run does.
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_run_status', 20)->nullable();
            $table->unsignedInteger('run_count')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'enabled']);
            $table->index('next_run_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('machines');
    }
};
