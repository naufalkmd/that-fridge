<?php

namespace App\Http\Controllers;

use App\Http\Resources\OrganizerTallyResource;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class OrganizerTallyController extends Controller
{
    private const DEFAULTS = [
        'items_checked_total' => 0,
        'items_correct_total' => 0,
        'last_checked_at' => null,
    ];

    public function show(Request $request)
    {
        $tally = $request->user()->organizerTally()->firstOrCreate([], self::DEFAULTS);

        return new OrganizerTallyResource($tally);
    }

    /**
     * Called once per full Organizer sweep (checkOrganizerMoves() on the frontend), reporting
     * how many items were checked and how many were already in the right spot. Cumulative, not
     * a snapshot - Tidiness reads as an ongoing habit rather than a single inventory audit.
     */
    public function increment(Request $request)
    {
        $data = $request->validate([
            'checked' => ['required', 'integer', 'min:1'],
            'correct' => ['required', 'integer', 'min:0'],
        ]);

        if ($data['correct'] > $data['checked']) {
            throw ValidationException::withMessages([
                'correct' => ['correct cannot exceed checked.'],
            ]);
        }

        $tally = $request->user()->organizerTally()->firstOrCreate([], self::DEFAULTS);
        $tally->increment('items_checked_total', $data['checked'], ['last_checked_at' => now()]);
        $tally->increment('items_correct_total', $data['correct']);

        // Explicit 200, same reasoning as BadgeController::progress - this is reporting an
        // ongoing tally, not creating a resource, even the very first increment.
        return (new OrganizerTallyResource($tally))->response()->setStatusCode(200);
    }
}
