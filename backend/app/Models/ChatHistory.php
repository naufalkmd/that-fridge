<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'session_id', 'agent', 'user_message', 'agent_response', 'recipe_suggestion'])]
class ChatHistory extends Model
{
    // The migration created a singular `chat_history` table, not Eloquent's default
    // pluralized guess (`chat_histories`).
    protected $table = 'chat_history';

    protected function casts(): array
    {
        return ['recipe_suggestion' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}