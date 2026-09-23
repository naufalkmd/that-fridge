<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MachineResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'prompt' => $this->prompt,
            'fridgeId' => (string) $this->fridge_id,
            // Nested to match what POST/PATCH accept - trigger_type/trigger_config are the
            // storage columns, but the wire shape (here and in the request body) is always
            // {type, config}.
            'trigger' => [
                'type' => $this->trigger_type,
                'config' => $this->trigger_config,
            ],
            'steps' => $this->steps,
            'enabled' => (bool) $this->enabled,
            'version' => $this->version,
            'nextRunAt' => $this->next_run_at?->toIso8601String(),
            'lastRunAt' => $this->last_run_at?->toIso8601String(),
            'lastRunStatus' => $this->last_run_status,
            'runCount' => $this->run_count,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
