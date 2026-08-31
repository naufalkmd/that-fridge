<?php

namespace App\Http\Controllers;

use App\Models\PushToken;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PushTokenController extends Controller
{
    /**
     * Register (or re-home) this device's Expo push token for the current user. Idempotent:
     * the same token posted again just refreshes updated_at; a token that belonged to another
     * account moves here (one device, one active user).
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:255'],
            'platform' => ['nullable', Rule::in(['ios', 'android'])],
        ]);

        PushToken::updateOrCreate(
            ['token' => $data['token']],
            ['user_id' => $request->user()->id, 'platform' => $data['platform'] ?? null],
        );

        return response()->noContent();
    }

    /**
     * Drop this device's token - called on sign-out so a shared phone stops getting the
     * previous user's pushes.
     */
    public function destroy(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
        ]);

        PushToken::where('user_id', $request->user()->id)
            ->where('token', $data['token'])
            ->delete();

        return response()->noContent();
    }
}
