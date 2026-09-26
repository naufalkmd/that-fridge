<?php

namespace App\Http\Controllers;

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
}
