<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/** One item on the operator's to-do list (see the create_admin_todos migration). */
#[Fillable(['title', 'details', 'category', 'priority', 'status', 'due_on', 'link', 'done_at'])]
class AdminTodo extends Model
{
    public const CATEGORIES = ['ios' => 'iOS', 'android' => 'Android', 'devpost' => 'Devpost', 'server' => 'Server', 'verify' => 'Verify', 'decision' => 'Decision', 'later' => 'Later'];

    public const PRIORITIES = ['blocker' => 'Launch blocker', 'high' => 'High', 'normal' => 'Normal', 'low' => 'Low'];

    protected function casts(): array
    {
        return ['due_on' => 'date', 'done_at' => 'datetime'];
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    /** Blockers first, then high, normal, low; earliest due date within a priority. */
    public function scopeByUrgency(Builder $query): Builder
    {
        return $query->orderByRaw("case priority when 'blocker' then 0 when 'high' then 1 when 'normal' then 2 else 3 end")
            ->orderByRaw('due_on is null')->orderBy('due_on')->orderBy('id');
    }
}
