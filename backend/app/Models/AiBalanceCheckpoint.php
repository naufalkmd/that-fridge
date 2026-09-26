<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A balance the operator read off a provider's dashboard (fal.ai offers no API for it). */
class AiBalanceCheckpoint extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['balance_usd' => 'float', 'recorded_at' => 'datetime'];
    }
}
