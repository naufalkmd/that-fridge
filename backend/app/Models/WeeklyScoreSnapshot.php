<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'week_of', 'waste_score', 'balance_score', 'overdue_count'])]
class WeeklyScoreSnapshot extends Model
{
    // Deliberately no 'date' cast on week_of - it's always written and queried as a plain
    // "Y-m-d" string (see SnapshotKitchenScores), and a Carbon-backed date cast round-trips
    // through the DB with a time component added on some drivers, which breaks both the
    // (user_id, week_of) uniqueness lookup in updateOrCreate and the streak's week-to-week
    // string comparisons.
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
