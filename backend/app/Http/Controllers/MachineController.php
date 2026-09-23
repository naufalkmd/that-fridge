<?php

namespace App\Http\Controllers;

use App\Models\Machine;
use App\Services\AgentService;
use App\Services\CreditService;
use App\Services\MachineDraftValidator;
use App\Support\CreditCost;
use App\Support\MachineSchedule;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MachineController extends Controller
{
    public function __construct(
        protected AgentService $agent,
        protected MachineDraftValidator $validator,
        protected CreditService $credits,
    ) {}

    /**
     * AI-draft a Machine's {name, trigger, steps} from a sentence. Returns the draft for the
     * user to review/edit - nothing is saved here, see store(). Metered in AI credits;
     * refunded when no valid draft comes back, since (unlike calorie estimation) there's no
     * usable deterministic fallback for "draft an automation".
     */
    public function draft(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:500'],
        ]);

        $this->credits->spend($request->user(), CreditCost::MACHINE_BUILD, 'machine_build');

        $result = $this->agent->draftMachine($request->user(), $data['prompt']);

        if (! $result['ok']) {
            $this->credits->grant($request->user(), CreditCost::MACHINE_BUILD, 'machine_build_refund');

            return response()->json(['ok' => false, 'message' => $result['message']], 200);
        }

        return response()->json(['ok' => true, 'draft' => $result['draft']], 200);
    }

    /** The user's own Machines - a Machine is scoped to its owner, not fridge membership
     *  (see MachinePolicy), so this is never scoped by fridge like most list endpoints here. */
    public function index(Request $request)
    {
        return Machine::where('user_id', $request->user()->id)->orderByDesc('created_at')->get();
    }

    /**
     * Save a (possibly hand-edited) draft as a real Machine. Re-validates server-side
     * regardless of whether it came from draft() untouched or was edited/built by hand -
     * either path could name a tool that isn't Machine-eligible or pass it bad arguments.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'prompt' => ['nullable', 'string', 'max:500'],
            'fridge_id' => ['required', Rule::exists('fridges', 'id')->where(
                fn ($q) => $q->whereIn('id', $request->user()->memberFridges()->pluck('fridges.id'))
            )],
            'trigger' => ['required', 'array'],
            'steps' => ['required', 'array'],
        ]);

        $result = $this->validator->validate($data, $request->user());
        if (! $result['valid']) {
            return response()->json(['errors' => $result['errors']], 422);
        }

        $machine = Machine::create([
            'user_id' => $request->user()->id,
            'fridge_id' => $data['fridge_id'],
            'name' => $result['draft']['name'],
            'prompt' => $data['prompt'] ?? null,
            'trigger_type' => $result['draft']['trigger_type'],
            'trigger_config' => $result['draft']['trigger_config'],
            'steps' => $result['draft']['steps'],
            'enabled' => false,
            'version' => 1,
            'next_run_at' => $result['draft']['trigger_type'] === 'schedule'
                ? MachineSchedule::nextRunAt($result['draft']['trigger_config'], now())
                : null,
        ]);

        return response()->json($machine, 201);
    }

    /**
     * Edit a Machine. Flipping just `enabled` (or renaming) doesn't require resubmitting a
     * full valid draft; touching `trigger` or `steps` re-validates the merged result and
     * bumps `version`, so a run-history audit can later tell which version actually ran.
     */
    public function update(Request $request, Machine $machine)
    {
        $this->authorize('update', $machine);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'enabled' => ['sometimes', 'boolean'],
            'trigger' => ['sometimes', 'array'],
            'steps' => ['sometimes', 'array'],
        ]);

        if (isset($data['trigger']) || isset($data['steps'])) {
            $merged = [
                'name' => $data['name'] ?? $machine->name,
                'trigger' => $data['trigger'] ?? ['type' => $machine->trigger_type, 'config' => $machine->trigger_config],
                'steps' => $data['steps'] ?? $machine->steps,
            ];

            $result = $this->validator->validate($merged, $request->user());
            if (! $result['valid']) {
                return response()->json(['errors' => $result['errors']], 422);
            }

            $machine->trigger_type = $result['draft']['trigger_type'];
            $machine->trigger_config = $result['draft']['trigger_config'];
            $machine->steps = $result['draft']['steps'];
            $machine->version++;
        }

        if (isset($data['name'])) {
            $machine->name = trim($data['name']);
        }

        // Re-derive next_run_at whenever the schedule itself changed, or whenever the Machine
        // is flipped on - otherwise enabling a Machine that's sat disabled for weeks would
        // immediately fire against a long-stale next_run_at instead of the next real
        // occurrence from now.
        $wasEnabling = array_key_exists('enabled', $data) && $data['enabled'] && ! $machine->enabled;
        if (array_key_exists('enabled', $data)) {
            $machine->enabled = (bool) $data['enabled'];
        }
        if ($machine->trigger_type === 'schedule' && ($wasEnabling || isset($data['trigger']))) {
            $machine->next_run_at = MachineSchedule::nextRunAt($machine->trigger_config, now());
        } elseif ($machine->trigger_type !== 'schedule') {
            $machine->next_run_at = null;
        }

        $machine->save();

        return response()->json($machine);
    }

    public function destroy(Request $request, Machine $machine)
    {
        $this->authorize('delete', $machine);

        $machine->delete();

        return response()->noContent();
    }
}
