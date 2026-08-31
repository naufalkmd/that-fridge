<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetCodeMail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Code-based password reset — the app never leaves itself. `POST /forgot-password` emails a
 * 6-digit code; `POST /reset-password` trades the code for a new password and a fresh session.
 * Reuses Laravel's built-in `password_reset_tokens` table (email PK) but stores a *hashed*
 * code in the `token` column rather than a link token.
 */
class PasswordResetController extends Controller
{
    private const CODE_TTL_MINUTES = 15;

    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if ($user) {
            $code = (string) random_int(100000, 999999);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => Hash::make($code), 'created_at' => now()],
            );

            Mail::to($user->email)->send(new PasswordResetCodeMail($code, self::CODE_TTL_MINUTES));
        }

        // Never reveal whether the address is registered.
        return response()->json([
            'message' => "If that email is registered, we've sent a reset code.",
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'code' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $row = DB::table('password_reset_tokens')->where('email', $data['email'])->first();

        $expired = $row && Carbon::parse($row->created_at)->addMinutes(self::CODE_TTL_MINUTES)->isPast();

        if (! $row || $expired || ! Hash::check($data['code'], $row->token)) {
            throw ValidationException::withMessages([
                'code' => ['That code is invalid or has expired.'],
            ]);
        }

        $user = User::where('email', $data['email'])->firstOrFail();

        $user->forceFill(['password' => Hash::make($data['password'])])->save();

        // A reset is a "lock everyone else out" event.
        $user->tokens()->delete();
        DB::table('password_reset_tokens')->where('email', $data['email'])->delete();

        $token = $user->createToken('thatfridge')->plainTextToken;

        return response()->json([
            'user' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'email' => $user->email,
            ],
            'token' => $token,
        ]);
    }
}
