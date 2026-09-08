<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OAuth\OAuthIdentity;
use App\Services\OAuth\OAuthVerifier;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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

        // Per-account lockout on top of the per-IP route throttle - stops credential stuffing
        // that rotates IPs to stay under the 6/min limit. 5 misses => locked ~15 min.
        $throttleKey = 'login:'.Str::lower($data['email']);
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            throw ValidationException::withMessages([
                'email' => ['Too many failed attempts. Try again in a few minutes.'],
            ]);
        }

        $user = User::where('email', $data['email'])->first();

        // A social-only account has no password; Hash::check on null still returns false, but
        // guard explicitly so the intent is clear.
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($throttleKey, 900);
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        RateLimiter::clear($throttleKey);

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
            // Cross-border transfer consent (PIPA / PDPA / UK-Swiss). 'sometimes|accepted':
            // a new client always sends it true; an old client (pre-1.2.2) omits it and the
            // completed OAuth handshake past the on-screen notice stands as the affirmative act.
            'dataTransferConsent' => ['sometimes', 'accepted'],
        ]);

        return $this->socialSignIn(
            $verifier->apple($data['identityToken']),
            $data['name'] ?? null,
            $request->boolean('dataTransferConsent'),
        );
    }

    /**
     * Google Sign-In. The app sends the `idToken` from @react-native-google-signin.
     */
    public function google(Request $request, OAuthVerifier $verifier): JsonResponse
    {
        $data = $request->validate([
            'idToken' => ['required', 'string'],
            'dataTransferConsent' => ['sometimes', 'accepted'],
        ]);

        return $this->socialSignIn(
            $verifier->google($data['idToken']),
            null,
            $request->boolean('dataTransferConsent'),
        );
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
     * Merge the coarse onboarding answer tags into the user's `preferences` bag. Sent once
     * on first sign-in by hydrateFromOnboarding (see apps/mobile/PRE_SIGNUP_ONBOARDING.md);
     * every field optional so a user who skipped the questions still gets a clean 200.
     */
    public function onboarding(Request $request): JsonResponse
    {
        $data = $request->validate([
            'goal' => ['nullable', Rule::in(['waste_less', 'cook_smarter', 'organize', 'save_money'])],
            'waste_frequency' => ['nullable', Rule::in(['weekly', 'monthly', 'rarely'])],
            'household' => ['nullable', Rule::in(['solo', 'partner', 'household', 'roommates'])],
        ]);

        $user = $request->user();
        $incoming = array_filter($data, fn ($value) => $value !== null);
        $user->preferences = array_merge($user->preferences ?? [], $incoming);
        $user->save();

        return response()->json(['user' => $this->userPayload($user)]);
    }

    /**
     * Change display name and/or username. Both are rate-limited on a rolling 30-day window
     * (User::PROFILE_CHANGE_LIMITS - username 1, name 3) against the append-only
     * user_profile_changes log, so a genuine typo fix is fine but handle-churn isn't. A
     * no-op value (unchanged, or same after trimming) never spends a slot.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'username' => [
                'sometimes', 'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('users', 'username')->ignore($user->id),
            ],
        ]);

        // The seeded demo / App Review accounts are managed - App Review signs in expecting
        // @keira, and the demo accounts find each other by fixed handle to test sharing.
        if ($data && $user->is_demo) {
            abort(403, 'This is a managed demo account — its name and username are fixed.');
        }

        $changes = [];
        foreach (['name', 'username'] as $field) {
            if (! array_key_exists($field, $data)) {
                continue;
            }
            $value = $field === 'username' ? $data[$field] : trim($data[$field]);
            if ($value === $user->{$field}) {
                continue; // unchanged — don't spend a rate-limit slot
            }
            if ($user->profileChangesRemaining($field) < 1) {
                $next = $user->nextProfileChangeAllowedAt($field);
                throw ValidationException::withMessages([
                    $field => [sprintf(
                        "You've changed your %s as many times as you can this month. You can change it again %s.",
                        $field,
                        $next ? $next->diffForHumans() : 'soon',
                    )],
                ]);
            }
            $changes[$field] = $value;
        }

        if ($changes) {
            DB::transaction(function () use ($user, $changes) {
                foreach ($changes as $field => $value) {
                    $user->profileChanges()->create([
                        'field' => $field,
                        'old_value' => $user->{$field},
                        'new_value' => $value,
                    ]);
                    $user->{$field} = $value;
                }
                $user->save();
            });
        }

        return response()->json(['user' => $this->userPayload($user->refresh())]);
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
    private function socialSignIn(OAuthIdentity $identity, ?string $fallbackName, bool $consent = false): JsonResponse
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
        } elseif ($consent && ! $user->data_transfer_consented_at) {
            // A pre-existing social account from before consent was captured here.
            $user->forceFill(['data_transfer_consented_at' => now()])->save();
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
                // Completing the OAuth handshake past the cross-border notice on the sign-in
                // screen is the affirmative consent act; record when it happened.
                'data_transfer_consented_at' => now(),
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
     *
     * `profileChanges` lets the edit-profile screen show "1 change left this month" and,
     * once spent, when the field unlocks again - without a second round-trip.
     */
    private function userPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'preferences' => $user->preferences ?? null,
            'credits' => (int) $user->ai_credits,
            'profileChanges' => $user->is_demo ? null : collect(User::PROFILE_CHANGE_LIMITS)
                ->mapWithKeys(fn ($limit, $field) => [$field => [
                    'limit' => $limit,
                    'remaining' => $user->profileChangesRemaining($field),
                    'nextAllowedAt' => $user->nextProfileChangeAllowedAt($field)?->toIso8601String(),
                ]])
                ->all(),
        ];
    }
}
