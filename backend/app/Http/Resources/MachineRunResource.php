<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MachineRunResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'machineVersion' => $this->machine_version,
            'status' => $this->status,
            'error' => $this->error,
            // Each entry mirrors what MachineRunner recorded per step - tool/content/ok/
            // skipped is enough for a user-facing "what happened" list; args/value/undo are
            // internal (undo in particular carries raw ids/snapshots - never surfaced to the
            // client, only `undoable` below says whether *a* step has one).
            'steps' => array_map(fn ($step) => [
                'tool' => $step['tool'],
                'content' => $step['content'],
                'ok' => $step['ok'],
                'skipped' => $step['skipped'] ?? false,
            ], $this->steps_run),
            'startedAt' => $this->created_at?->toIso8601String(),
            'undoable' => $this->undone_at === null
                && collect($this->steps_run)->contains(fn ($step) => ! ($step['skipped'] ?? false) && is_array($step['undo'] ?? null)),
            'undoneAt' => $this->undone_at?->toIso8601String(),
        ];
    }
}
