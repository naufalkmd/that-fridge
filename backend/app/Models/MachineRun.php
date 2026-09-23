<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['machine_id', 'machine_version', 'status', 'steps_run', 'error'])]
class MachineRun extends Model
{
    protected function casts(): array
    {
        return [
            'steps_run' => 'array',
        ];
    }

    public function machine(): BelongsTo
    {
        return $this->belongsTo(Machine::class);
    }
}
