<?php

namespace App\Http\Controllers;

use App\Models\ItemOutcome;
use App\Services\CalendarService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    /**
     * Dated entries for a local date range across the caller's fridges (or one of them).
     * Deliberately not the {"data": ...} wrapper - the sibling `truncated` flag would be
     * stripped by the client's unwrap (same reason as recipes/suggest).
     */
    public function index(Request $request, CalendarService $calendar)
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'tz' => ['sometimes', 'timezone:all'],
            'fridge' => ['sometimes', 'nullable', 'integer'],
        ]);

        abort_if(Carbon::parse($data['from'])->diffInDays(Carbon::parse($data['to'])) > CalendarService::MAX_DAYS, 422, 'Range too long.');

        $mine = $request->user()->memberFridges()->pluck('fridges.id')->all();
        $onlyFridge = null;
        if (! empty($data['fridge'])) {
            abort_unless(in_array((int) $data['fridge'], array_map('intval', $mine), true), 404);
            $mine = [(int) $data['fridge']];
            $onlyFridge = (int) $data['fridge'];
        }

        $result = $calendar->entries($request->user(), $data['from'], $data['to'], $data['tz'] ?? 'UTC', $mine, $onlyFridge);

        return response()->json($result + ['from' => $data['from'], 'to' => $data['to']]);
    }

    /**
     * Clear one day's "used up" or "thrown out" history - what the calendar shows as a per-day count.
     * Removes those outcome rows only: it does not change the Kitchen Score (which reads usage history,
     * not these rows), and the items are already gone. `tz` places the day the same way GET /calendar does.
     */
    public function clearHistory(Request $request)
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'outcome' => ['required', 'in:used,wasted'],
            'tz' => ['sometimes', 'timezone:all'],
        ]);

        $tz = $data['tz'] ?? 'UTC';
        $start = Carbon::parse($data['date'], $tz)->startOfDay()->utc();
        $end = $start->copy()->setTimezone($tz)->endOfDay()->utc();

        $deleted = ItemOutcome::query()
            ->where('user_id', $request->user()->id)
            ->where('outcome', $data['outcome'])
            ->whereNull('undone_at')
            ->where('created_at', '>=', $start)->where('created_at', '<=', $end)
            ->delete();

        return response()->json(['deleted' => $deleted]);
    }
}
