<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One recipient of a service notice, and whether their email went out. */
#[Fillable(['service_notice_id', 'user_id', 'email', 'status', 'error', 'sent_at'])]
class ServiceNoticeDelivery extends Model
{
    protected function casts(): array
    {
        return ['sent_at' => 'datetime'];
    }

    public function notice(): BelongsTo
    {
        return $this->belongsTo(ServiceNotice::class, 'service_notice_id');
    }
}
