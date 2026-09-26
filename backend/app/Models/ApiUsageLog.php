<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/** One call to a paid AI provider (see the create_api_usage_logs migration). Written by ApiUsageLogger, read by the admin dashboard. */
#[Fillable(['provider', 'feature', 'model', 'user_id', 'prompt_tokens', 'completion_tokens', 'cost_usd', 'cost_estimated', 'ok', 'reason', 'latency_ms'])]
class ApiUsageLog extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['cost_usd' => 'float', 'cost_estimated' => 'boolean', 'ok' => 'boolean'];
    }
}
