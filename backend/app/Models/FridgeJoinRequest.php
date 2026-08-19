<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['fridge_id', 'requester_id', 'status', 'initiated_by'])]
class FridgeJoinRequest extends Model
{
    public const STATUSES = ['pending', 'accepted', 'declined'];

    // 'requester' (requester_id asked to join) or 'owner' (the fridge owner invited
    // requester_id) - requester_id/requester() always mean "the user this row is about,"
    // regardless of which side initiated it.
    public const INITIATORS = ['requester', 'owner'];

    public function fridge(): BelongsTo
    {
        return $this->belongsTo(Fridge::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }
}
