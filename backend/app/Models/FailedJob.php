<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Read-only view of Laravel's failed_jobs table, for the admin panel. */
class FailedJob extends Model
{
    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'failed_at' => 'datetime',
        ];
    }

    /** The queued job's class, pulled from its serialized payload. */
    public function jobName(): string
    {
        return json_decode($this->payload, true)['displayName'] ?? 'unknown';
    }
}
