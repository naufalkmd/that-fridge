<?php

namespace App\Services;

use App\Models\Machine;
use App\Models\MachineRun;
use App\Support\MachineSchedule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Replays a saved Machine's steps with zero AI involved - the deterministic-execution half of
 * "AI-assisted authoring, deterministic execution" (see the machines migration docblock).
 * Every step re-dispatches through AgentToolbox::run(..., surface: 'machine'), which is what
 * actually enforces tool-eligibility at run time (not just at save time) - see
 * AgentToolbox::toolAllowedOn().
 */
class MachineRunner
{
    /**
     * How long a {stepN} placeholder substitution is allowed to make a later step's argument -
     * long enough to be useful in a notify_user message, short enough that one large
     * list_items-style result can't blow up a later argument.
     */
    private const PLACEHOLDER_MAX_LENGTH = 300;

    public function __construct(private AgentToolbox $toolbox) {}

    /**
     * Runs one Machine now, regardless of trigger type or next_run_at - callers (the due-
     * schedule sweep, an event hook, a manual "Run now") decide *when* to call this, not this
     * method. Takes a per-machine lock so a Machine that's still running can't be started
     * again by an overlapping dispatch; returns null (does nothing) if a run is already in
     * flight, or if the Machine is disabled and $force wasn't passed - $force is for an
     * explicit manual test run, where testing a disabled (not-yet-trusted) Machine is the
     * whole point.
     */
    public function run(Machine $machine, bool $force = false): ?MachineRun
    {
        $lock = Cache::lock("machine-run:{$machine->id}", 300);
        if (! $lock->get()) {
            return null;
        }

        try {
            $machine->refresh();

            return ($force || $machine->enabled) ? $this->execute($machine) : null;
        } finally {
            $lock->release();
        }
    }

    private function execute(Machine $machine): MachineRun
    {
        $results = [];
        $stepsRun = [];
        $error = null;

        foreach ($machine->steps as $i => $step) {
            if (isset($step['condition']) && ! $this->conditionMet($step['condition'], $results)) {
                $stepsRun[] = [
                    'tool' => $step['tool'],
                    'args' => $step['args'] ?? [],
                    'content' => 'Skipped - condition not met.',
                    'ok' => true,
                    'value' => null,
                    'skipped' => true,
                ];

                continue;
            }

            $args = $this->resolvePlaceholders($step['args'] ?? [], $results);

            $result = $this->toolbox->run($step['tool'], $args, $machine->user, $machine->fridge_id, 'machine');

            $results[$i + 1] = $result;
            $stepsRun[] = [
                'tool' => $step['tool'],
                'args' => $args,
                'content' => $result['content'],
                'ok' => $result['ok'],
                'value' => $result['value'],
                'skipped' => false,
            ];

            if (! $result['ok']) {
                $error = $result['content'];
                break;
            }
        }

        $status = $error ? 'failed' : 'success';

        $run = MachineRun::create([
            'machine_id' => $machine->id,
            'machine_version' => $machine->version,
            'status' => $status,
            'steps_run' => $stepsRun,
            'error' => $error,
        ]);

        $machine->last_run_at = now();
        $machine->last_run_status = $status;
        $machine->last_run_error = $error;
        $machine->run_count++;
        if ($machine->trigger_type === 'schedule') {
            $machine->next_run_at = MachineSchedule::nextRunAt($machine->trigger_config, now());
        }
        $machine->save();

        return $run;
    }

    /**
     * `(float)` casting a string reads its leading numeric prefix and ignores the rest, so
     * this needs no special parsing across sum_item_field's different value formats - plain
     * ("14"), kcal-suffixed ("150 kcal"), or unit-concatenated ("2kg") all cast correctly.
     * A referenced step that never ran (itself skipped, or this is somehow stale) reads as 0.
     */
    private function conditionMet(array $condition, array $results): bool
    {
        $value = (float) ($results[$condition['step']]['value'] ?? 0);

        return match ($condition['op']) {
            'lt' => $value < $condition['value'],
            'lte' => $value <= $condition['value'],
            'gt' => $value > $condition['value'],
            'gte' => $value >= $condition['value'],
        };
    }

    /**
     * Substitutes {stepN} inside string argument values with step N's `value` (falling back to
     * its `content`, truncated) - the one data-passing convention a Machine step gets. Mirrors
     * the syntax MachineDraftValidator::validatePlaceholders already checked at save time; an
     * unresolved reference (shouldn't happen given that check held) is left as literal text
     * rather than thrown, since a step still ran and shouldn't crash the whole Machine over a
     * cosmetic substitution miss.
     */
    private function resolvePlaceholders(array $args, array $results): array
    {
        return array_map(function ($value) use ($results) {
            if (! is_string($value)) {
                return $value;
            }

            return preg_replace_callback('/\{step(\d+)\}/', function ($m) use ($results) {
                $result = $results[(int) $m[1]] ?? null;
                if (! $result) {
                    return $m[0];
                }

                return Str::limit((string) ($result['value'] ?? $result['content'] ?? ''), self::PLACEHOLDER_MAX_LENGTH, '');
            }, $value);
        }, $args);
    }
}
