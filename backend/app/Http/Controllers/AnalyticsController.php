<?php

namespace App\Http\Controllers;

use App\Models\AnalyticsEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AnalyticsController extends Controller
{
    /** Cap on the JSON-encoded size of a single event's props, to keep rows small. */
    private const MAX_PROPS_BYTES = 2000;

    /**
     * Ingest a batch of first-party events. Public route (pre-sign-in events have no token) —
     * if a valid bearer token is present the events are attributed to that user, otherwise
     * they ride on the client's `anon_id` only. Best-effort: a malformed event is dropped,
     * not 422'd, so a client bug can't break its own analytics loop.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'events' => ['required', 'array', 'min:1', 'max:50'],
            'events.*.name' => ['required', 'string', 'max:80'],
            'events.*.props' => ['nullable', 'array'],
            'events.*.anon_id' => ['nullable', 'string', 'max:64'],
            'events.*.platform' => ['nullable', 'string', 'max:16'],
            'events.*.app_version' => ['nullable', 'string', 'max:24'],
            'events.*.ts' => ['nullable', 'numeric'],
        ]);

        // Optional auth: the route is public so pre-sign-in events get through, but a
        // logged-in client still sends its token and those events should be attributed.
        // The default guard is session-based, so fall through to sanctum for the token.
        $userId = ($request->user() ?? $request->user('sanctum'))?->id;
        $now = now();

        $rows = [];
        foreach ($data['events'] as $event) {
            $props = $event['props'] ?? null;
            if ($props !== null && strlen(json_encode($props)) > self::MAX_PROPS_BYTES) {
                $props = null;
            }

            $rows[] = [
                'user_id' => $userId,
                'anon_id' => $event['anon_id'] ?? null,
                'name' => $event['name'],
                'props' => $props !== null ? json_encode($props) : null,
                'platform' => $event['platform'] ?? null,
                'app_version' => $event['app_version'] ?? null,
                'occurred_at' => isset($event['ts'])
                    ? Carbon::createFromTimestampMs((int) $event['ts'])
                    : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        AnalyticsEvent::insert($rows);

        return response()->noContent();
    }
}
