<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['fridge_id', 'requester_id', 'status'])]
class FridgeJoinRequest extends Model
{
    public const STATUSES = ['pending', 'accepted', 'declined'];

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }
}
