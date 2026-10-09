<?php

namespace App\Http\Controllers;

use App\Models\AndroidWaitlistSignup;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WaitlistController extends Controller
{
    /**
     * Public Android waitlist signup from thatfridge.com. Every accepted request gets the same
     * {"ok":true} - a repeat email and a filled honeypot included - so the form can't be used to
     * check whether an address is already on the list, and bots don't learn they were caught.
     */
    public function store(Request $request)
    {
        // Honeypot: a hidden field people never see. Anything in it is a bot; store nothing.
        if (filled($request->input('website'))) {
            return response()->json(['ok' => true], 201);
        }

        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'consent' => ['accepted'],
            'source' => ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9_-]+$/'],
        ]);

        // Cloudflare sends XX for unknown and T1 for Tor; keep only real two-letter codes.
        $country = Str::upper((string) $request->header('CF-IPCountry'));
        $country = preg_match('/^[A-Z]{2}$/', $country) && ! in_array($country, ['XX', 'T1'], true) ? $country : null;

        AndroidWaitlistSignup::firstOrCreate(
            ['email' => Str::lower(trim($data['email']))],
            ['country' => $country, 'source' => $data['source'] ?? null, 'consented_at' => now()],
        );

        return response()->json(['ok' => true], 201);
    }
}
