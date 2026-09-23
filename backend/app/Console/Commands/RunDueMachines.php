<?php

namespace App\Console\Commands;

use App\Jobs\RunMachine;
use App\Models\Machine;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Finds enabled schedule-triggered Machines whose next_run_at has arrived and queues one
 * RunMachine job each - queued, not run inline, so one slow Machine can't hold up the sweep or
 * delay the next tick. item_added/threshold triggers dispatch elsewhere (not yet built - see
 * the machines migration docblock); this command only ever touches trigger_type = 'schedule'.
 */
#[Signature('app:run-due-machines')]
#[Description('Queue a run for every enabled schedule-triggered Machine whose next_run_at has arrived')]
class RunDueMachines extends Command
{
    public function handle(): void
    {
        Machine::query()
            ->where('enabled', true)
            ->where('trigger_type', 'schedule')
            ->where('next_run_at', '<=', now())
            ->get()
            ->each(fn (Machine $machine) => RunMachine::dispatch($machine->id));
    }
}
