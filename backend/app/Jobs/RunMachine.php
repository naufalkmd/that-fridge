<?php

namespace App\Jobs;

use App\Models\Machine;
use App\Services\MachineRunner;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Thin queue wrapper around MachineRunner - kept separate from it so the actual replay logic
 * can be unit-tested by calling MachineRunner::run() directly, without a queue fake.
 */
class RunMachine implements ShouldQueue
{
    use Queueable;

    /**
     * A failed step is a normal recorded outcome (see MachineRunner), not a transient failure
     * worth a queue retry - retrying would risk running an already-partially-applied Machine
     * a second time.
     */
    public int $tries = 1;

    public function __construct(public int $machineId) {}

    public function handle(MachineRunner $runner): void
    {
        $machine = Machine::find($this->machineId);
        if (! $machine) {
            return;
        }

        $runner->run($machine);
    }
}
