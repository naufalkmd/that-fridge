<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per Machine execution - an audit trail of what actually ran. `steps` on the Machine
 * itself can be edited after the fact (bumping `version`), so a run records which version of
 * the step list it used, not just a pointer back to the Machine's current state.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('machine_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('machine_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('machine_version');
            $table->string('status', 20); // success | failed
            $table->json('steps_run'); // [{"tool":..., "args":..., "content":..., "ok":..., "value":...}, ...]
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['machine_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('machine_runs');
    }
};
