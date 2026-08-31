<?php

namespace App\Services\OAuth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

/**
 * Verifies the identity token the app gets back from "Sign in with Apple" / Google Sign-In.
 *
 * Both are signed JWTs. We fetch the provider's public keys (JWKS, cached), verify the
 * signature and the standard claims (iss / aud / exp), and pull out a stable user id + email.
 * Nothing here trusts a claim the client could have forged.
 */
class OAuthVerifier
{
    private const APPLE_ISS = 'https://appleid.apple.com';

    private const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';

    private const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

    private const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

    public function apple(string $identityToken): OAuthIdentity
    {
        $claims = $this->decode($identityToken, self::APPLE_JWKS, 'apple');

        if (($claims['iss'] ?? null) !== self::APPLE_ISS) {
            $this->fail('Unexpected token issuer.');
        }
        $this->assertAudience($claims['aud'] ?? null, config('services.apple.client_ids', []));

        return new OAuthIdentity(
            provider: 'apple',
            sub: (string) $claims['sub'],
            email: $claims['email'] ?? null,
            // Apple sends these as the strings "true"/"false".
            emailVerified: filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOL),
        );
    }

    public function google(string $idToken): OAuthIdentity
    {
        $claims = $this->decode($idToken, self::GOOGLE_JWKS, 'google');

        if (! in_array($claims['iss'] ?? null, self::GOOGLE_ISS, true)) {
            $this->fail('Unexpected token issuer.');
        }
        $this->assertAudience($claims['aud'] ?? null, config('services.google.client_ids', []));

        return new OAuthIdentity(
            provider: 'google',
            sub: (string) $claims['sub'],
            email: $claims['email'] ?? null,
            emailVerified: filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOL),
            name: $claims['name'] ?? null,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(string $token, string $jwksUrl, string $provider): array
    {
        $keys = Cache::remember("oauth_jwks_{$provider}", now()->addHours(6), function () use ($jwksUrl) {
            $response = Http::acceptJson()->get($jwksUrl);
            $response->throw();

            return $response->json();
        });

        try {
            JWT::$leeway = 60;
            $decoded = JWT::decode($token, JWK::parseKeySet($keys));
        } catch (\Throwable $e) {
            $this->fail('Could not verify that sign-in. Please try again.');
        }

        return (array) $decoded;
    }

    /**
     * @param  list<string>  $allowed
     */
    private function assertAudience(mixed $aud, array $allowed): void
    {
        $audiences = is_array($aud) ? $aud : [$aud];

        if (empty($allowed) || empty(array_intersect($audiences, $allowed))) {
            $this->fail('This sign-in was issued for a different app.');
        }
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['token' => [$message]]);
    }
}
