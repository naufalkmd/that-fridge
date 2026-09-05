<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OAuth\OAuthIdentity;
use App\Services\OAuth\OAuthVerifier;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            // Korea PIPA wants explicit, separate consent for cross-border transfer of
            // personal data - distinct from agreeing to the Terms/Privacy Policy generally.
            // 'accepted' means it must be true/1/"yes" - anything else (including omitted)
            // fails validation.
            'dataTransferConsent' => ['required', 'accepted'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'data_transfer_consented_at' => now(),
        ]);

        $user->notificationPref()->create([]);

        $token = $user->createToken('thatfridge')->plainTextToken;

        return response()->json([
            'user' => $this->userPayload($user),
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        // A social-only account has no password; Hash::check on null still returns false, but
        // guard explicitly so the intent is clear.
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        $token = $user->createToken('thatfridge')->plainTextToken;

        return response()->json([
            'user' => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    /**
     * Sign in with Apple. The app sends the `identityToken` from AppleAuthentication, plus
     * `name` on the very first sign-in only (Apple drops it from the token after that).
     */
    public function apple(Request $request, OAuthVerifier $verifier): JsonResponse
    {
        $data = $request->validate([
            'identityToken' => ['required', 'string'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        return $this->socialSignIn($verifier->apple($data['identityToken']), $data['name'] ?? null);
    }

    /**
     * Google Sign-In. The app sends the `idToken` from @react-native-google-signin.
     */
    public function google(Request $request, OAuthVerifier $verifier): JsonResponse
    {
        $data = $request->validate([
            'idToken' => ['required', 'string'],
        ]);

        return $this->socialSignIn($verifier->google($data['idToken']), null);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $this->userPayload($request->user()),
        ]);
    }

    /**
     * Permanently delete the authenticated user and everything they own. Required by
     * Apple App Store Guideline 5.1.1(v) for any app with account registration.
     *
     * Owned fridges (and their sections/items/notes/shopping items via FK cascade),
     * chat history, recipes, usage history, score snapshots and badges all cascade
     * from the users row. Tokens are revoked explicitly first.
     */
    public function destroy(Request $request)
    {
        $user = $request->user();

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Account deleted.']);
    }

    /**
     * Resolve a verified social identity to a session: reuse the account already linked to
     * this provider id, else link one that shares the verified email, else create a fresh
     * passwordless account.
     */
    private function socialSignIn(OAuthIdentity $identity, ?string $fallbackName): JsonResponse
    {
        $user = User::where('oauth_provider', $identity->provider)
            ->where('oauth_sub', $identity->sub)
            ->first();

        if (! $user && $identity->email && $identity->emailVerified) {
            $user = User::where('email', $identity->email)->first();
            $user?->update([
                'oauth_provider' => $identity->provider,
                'oauth_sub' => $identity->sub,
            ]);
        }

        $created = false;
        if (! $user) {
            $user = $this->createSocialUser($identity, $fallbackName);
            $created = true;
        }

        $token = $user->createToken('thatfridge')->plainTextToken;

        return response()->json([
            'user' => $this->userPayload($user),
            'token' => $token,
        ], $created ? 201 : 200);
    }

    private function createSocialUser(OAuthIdentity $identity, ?string $fallbackName): User
    {
        $name = $identity->name ?: $fallbackName ?: 'ThatFridge cook';
        // Only a verified address becomes the account email (a verified one that already
        // belongs to someone was linked in socialSignIn, so it can't collide here). Apple
        // "Hide My Email", a missing address, or an unverified one all fall back to a stable
        // synthetic address for the NOT NULL + unique email column.
        $email = ($identity->email && $identity->emailVerified)
            ? $identity->email
            : "{$identity->provider}_{$identity->sub}@users.thatfridge.app";
        $usernameSeed = $identity->email ? Str::before($identity->email, '@') : $name;

        try {
            $user = User::create([
                'name' => $name,
                'username' => $this->generateUniqueUsername($usernameSeed),
                'email' => $email,
                'password' => null,
                'oauth_provider' => $identity->provider,
                'oauth_sub' => $identity->sub,
            ]);
        } catch (QueryException $e) {
            // A concurrent first sign-in from the same device won the (provider, sub) unique
            // index — use the row it made. Anything else is a real error.
            $raced = User::where('oauth_provider', $identity->provider)
                ->where('oauth_sub', $identity->sub)
                ->first();
            if (! $raced) {
                throw $e;
            }

            return $raced;
        }

        if ($identity->emailVerified) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        $user->notificationPref()->create([]);

        return $user;
    }

    private function generateUniqueUsername(string $seed): string
    {
        $slug = Str::lower(preg_replace('/[^a-z0-9]/i', '', $seed));
        if ($slug === '' || $slug === null) {
            $slug = 'cook';
        }
        $slug = Str::limit($slug, 20, '');

        $candidate = $slug;
        $suffix = 1;
        while (User::where('username', $candidate)->exists()) {
            $suffix++;
            $candidate = $slug.$suffix;
        }

        return $candidate;
    }

    /**
     * Shared shape for the "current user" payload returned by register/login/me. Needs its
     * own id (the shared-fridge member list renders "(you)" and disables self-removal by
     * comparing against it) and username (find-a-friend search matches on this).
     */
    private function userPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
        ];
    }
}
