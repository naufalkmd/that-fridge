<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One append-only credit movement. Written only by CreditService. */
#[Fillable(['user_id', 'delta', 'balance_after', 'reason', 'ref'])]
class AiCreditLedger extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'ai_credit_ledger';

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
