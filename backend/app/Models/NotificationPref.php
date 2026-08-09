<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'expiry_alerts', 'low_stock', 'recipe_tips', 'weekly_digest', 'crew_actions_enabled'])]
class NotificationPref extends Model
{
    protected function casts(): array
    {
        return [
            'expiry_alerts' => 'boolean',
            'low_stock' => 'boolean',
            'recipe_tips' => 'boolean',
            'weekly_digest' => 'boolean',
            'crew_actions_enabled' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
