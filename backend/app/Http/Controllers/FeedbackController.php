<?php

namespace App\Http\Controllers;

use App\Mail\FeedbackSubmittedMail;
use App\Models\Feedback;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class FeedbackController extends Controller
{
    /**
     * Stores the message either way, then best-effort emails the team - a mail outage
     * shouldn't lose the feedback itself, just the immediate notification of it.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'message' => ['required', 'string', 'max:4000'],
        ]);

        $feedback = Feedback::create([...$data, 'user_id' => $request->user()->id]);

        try {
            Mail::to('support@thatfridge.com')->send(new FeedbackSubmittedMail($feedback));
        } catch (\Throwable $e) {
            Log::warning('Failed to send feedback notification email', ['feedback_id' => $feedback->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['message' => 'Thanks for the feedback.'], 201);
    }
}
