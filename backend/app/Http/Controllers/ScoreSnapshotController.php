<?php

namespace App\Http\Controllers;

use App\Http\Resources\WeeklyScoreSnapshotResource;
use Illuminate\Http\Request;

class ScoreSnapshotController extends Controller
{
    private const DEFAULT_WEEKS = 12;

    private const MAX_WEEKS = 52;

    /**
     * Read-only - rows are written exclusively by the app:snapshot-kitchen-scores cron
     * (KitchenScoreService), not pushed from the frontend, so streaks reflect what actually
     * happened in the fridge each week rather than only weeks the user happened to open the app.
     */
    public function index(Request $request)
    {
        $weeks = min(self::MAX_WEEKS, max(1, (int) $request->query('weeks', self::DEFAULT_WEEKS)));

        $snapshots = $request->user()->weeklyScoreSnapshots()
            ->orderByDesc('week_of')
            ->limit($weeks)
            ->get()
            ->sortBy('week_of')
            ->values();

        return WeeklyScoreSnapshotResource::collection($snapshots);
    }
}
