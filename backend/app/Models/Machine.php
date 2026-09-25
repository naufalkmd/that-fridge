<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A Kitchen Lab "Machine" - see the create_machines_table migration for the full shape and
 * MachineDraftValidator for what a valid `steps`/`trigger_config` actually contains.
 *
 * trigger_config by trigger_type:
 *   schedule:    {"frequency": "daily"|"weekly", "time": "HH:MM", "weekday": 0-6, "timezone": "..."}
 *   item_added:  {"search": "..."|null, "location": "fridge"|"freezer"|"pantry"|null}
 *   threshold:   {"field": "quantity"|"weight"|"calories"|"custom", "custom_field_label": "..."|null, "unit": "..."|null, "filter": {...sum_item_field filters...}, "op": "lt"|"lte"|"gt"|"gte", "value": number}
 *   recipe_made: {"recipe_id": int|null - null means any recipe}
 *
 * steps: [{"tool": "sum_item_field", "args": {"field": "calories", "expiring_within_days": 3}},
 *          {"tool": "notify_user", "args": {"message": "Expiring soon: {step1}"}, "condition": {"step": 1, "op": "gte", "value": 2000}}]
 * Each tool must be Machine-eligible (AgentToolbox::MACHINE_TOOLS). A string arg may contain
 * "{stepN}" (1-based, N less than the current step's position), resolved to step N's `value`
 * (falling back to its `content`) before that step's args are re-validated and dispatched -
 * deliberately the only placeholder syntax, not a general expression language. A step's
 * optional `condition` (same shape and op vocabulary as a threshold trigger) skips it unless
 * an earlier sum_item_field step's `value` compares that way - the only other piece of
 * step-to-step logic a Machine gets, deliberately a guard clause and not branching to a
 * different path.
 */
#[Fillable([
    'user_id', 'fridge_id', 'name', 'prompt', 'trigger_type', 'trigger_config', 'steps',
    'enabled', 'threshold_met', 'version', 'next_run_at', 'last_run_at', 'last_run_status',
    'last_run_error', 'run_count',
])]
class Machine extends Model
{
    protected function casts(): array
    {
        return [
            'trigger_config' => 'array',
            'steps' => 'array',
            'enabled' => 'boolean',
            'threshold_met' => 'boolean',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function runs(): HasMany
    {
        return $this->hasMany(MachineRun::class);
    }
}
