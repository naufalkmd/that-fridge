<?php

namespace App\Models;

use App\Observers\FeedbackObserver;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy([FeedbackObserver::class])]
#[Fillable(['user_id', 'email', 'message', 'status', 'admin_note'])]
class Feedback extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
