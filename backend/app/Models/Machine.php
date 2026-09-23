<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A Kitchen Lab "Machine" - see the create_machines_table migration for the full shape and
 * MachineDraftValidator for what a valid `steps`/`trigger_config` actually contains.
 *
 * trigger_config by trigger_type:
 *   schedule:    {"frequency": "daily"|"weekly", "time": "HH:MM", "weekday": 0-6, "timezone": "..."}
 *   item_added:  {"search": "..."|null, "location": "fridge"|"freezer"|"pantry"|null}
 *   threshold:   {"field": "quantity"|"weight"|"calories", "unit": "..."|null, "filter": {...sum_item_field filters...}, "op": "lt"|"lte"|"gt"|"gte", "value": number}
 *
 * steps: [{"tool": "sum_item_field", "args": {"field": "calories", "expiring_within_days": 3}},
 *          {"tool": "notify_user", "args": {"message": "Expiring soon: {step1}"}}]
 * Each tool must be Machine-eligible (AgentToolbox::MACHINE_TOOLS). A string arg may contain
 * "{stepN}" (1-based, N less than the current step's position), resolved to step N's `value`
 * (falling back to its `content`) before that step's args are re-validated and dispatched -
 * deliberately the only placeholder syntax, not a general expression language.
 */
#[Fillable([
    'user_id', 'fridge_id', 'name', 'prompt', 'trigger_type', 'trigger_config', 'steps',
    'enabled', 'version', 'next_run_at', 'last_run_at', 'last_run_status', 'run_count',
])]
class Machine extends Model
{
    protected function casts(): array
    {
        return [
            'trigger_config' => 'array',
            'steps' => 'array',
            'enabled' => 'boolean',
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
}
