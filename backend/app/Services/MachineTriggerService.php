<?php

namespace App\Services;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * The two non-schedule ways a Machine fires - mirrors RunDueMachines' schedule sweep. Both
 * just filter down to the Machines that should run and dispatch RunMachine; MachineRunner
 * itself is trigger-type-agnostic, so nothing here touches it.
 */
class MachineTriggerService
{
    public function __construct(private AgentToolbox $toolbox) {}

    /**
     * Only call this from an Auth::check()-gated path (see ItemObserver::created()) - a
     * Machine's own add_item/bulk_add_items step runs with no web-request Auth context, so
     * routing through this same gate is what stops it from re-triggering another item_added
     * Machine in a loop.
     */
    public function itemAdded(Item $item, Fridge $fridge): void
    {
        Machine::query()
            ->where('fridge_id', $fridge->id)
            ->where('enabled', true)
            ->where('trigger_type', 'item_added')
            ->get()
            ->each(function (Machine $machine) use ($item) {
                $config = $machine->trigger_config;
                if ($config['search'] && ! str_contains(Str::lower($item->name), Str::lower($config['search']))) {
                    return;
                }
                if ($config['location'] && $config['location'] !== $item->location) {
                    return;
                }

                RunMachine::dispatch($machine->id);
            });
    }

    /**
     * Only call this from an Auth::check()-gated path (see RecipeObserver::updated()) - same
     * loop guard as itemAdded(), for the same reason. Scoped by the Machine's owning user, not
     * a fridge - a recipe's made_count isn't fridge-bound (a curated recipe has no fridge at
     * all), and "made" is inherently a personal action.
     */
    public function recipeMade(Recipe $recipe, User $actingUser): void
    {
        Machine::query()
            ->where('user_id', $actingUser->id)
            ->where('enabled', true)
            ->where('trigger_type', 'recipe_made')
            ->get()
            ->each(function (Machine $machine) use ($recipe) {
                $recipeId = $machine->trigger_config['recipe_id'] ?? null;
                if ($recipeId !== null && (int) $recipeId !== $recipe->id) {
                    return;
                }

                RunMachine::dispatch($machine->id);
            });
    }

    /**
     * Deliberately NOT Auth-gated, unlike itemAdded() - a Machine's own inventory-changing
     * step must be able to trip a DIFFERENT Machine's threshold. Safe to call unconditionally:
     * edge-triggering means a Machine whose own write keeps its condition met only fires once,
     * and MachineRunner's per-machine lock already stops direct self-reentrancy.
     */
    public function recheckThresholds(Fridge $fridge): void
    {
        Machine::query()
            ->where('fridge_id', $fridge->id)
            ->where('enabled', true)
            ->where('trigger_type', 'threshold')
            ->get()
            ->each(fn (Machine $machine) => $this->checkThreshold($machine));
    }

    private function checkThreshold(Machine $machine): void
    {
        $config = $machine->trigger_config;
        // filter is unvalidated client JSON - field/unit/custom_field_label/fridge_id always
        // come from the trigger's own validated config, never from filter, regardless of what
        // filter happens to contain.
        $args = array_merge($config['filter'] ?? [], [
            'field' => $config['field'],
            'unit' => $config['unit'],
            'custom_field_label' => $config['custom_field_label'] ?? null,
            'fridge_id' => $machine->fridge_id,
        ]);

        $total = $this->toolbox->fieldTotal($machine->user, $args);

        $met = match ($config['op']) {
            'lt' => $total < $config['value'],
            'lte' => $total <= $config['value'],
            'gt' => $total > $config['value'],
            'gte' => $total >= $config['value'],
        };

        if ($met === $machine->threshold_met) {
            return;
        }

        $machine->threshold_met = $met;
        $machine->save();

        if ($met) {
            RunMachine::dispatch($machine->id);
        }
    }
}
