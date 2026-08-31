<?php

namespace Tests\Unit\Services;

use App\Services\OAuth\OAuthVerifier;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class OAuthVerifierTest extends TestCase
{
    private array $key;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        $resource = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        openssl_pkey_export($resource, $privatePem);
        $details = openssl_pkey_get_details($resource);

        $this->key = [
            'private' => $privatePem,
            'kid' => 'test-kid',
            'jwks' => ['keys' => [[
                'kty' => 'RSA',
                'kid' => 'test-kid',
                'use' => 'sig',
                'alg' => 'RS256',
                'n' => rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '='),
                'e' => rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '='),
            ]]],
        ];
    }

    private function token(array $claims): string
    {
        return JWT::encode($claims, $this->key['private'], 'RS256', $this->key['kid']);
    }

    private function fakeGoogleJwks(): void
    {
        Http::fake(['www.googleapis.com/*' => Http::response($this->key['jwks'])]);
        config(['services.google.client_ids' => ['web-client-id.apps.googleusercontent.com']]);
    }

    public function test_it_accepts_a_correctly_signed_google_token(): void
    {
        $this->fakeGoogleJwks();

        $identity = app(OAuthVerifier::class)->google($this->token([
            'iss' => 'https://accounts.google.com',
            'aud' => 'web-client-id.apps.googleusercontent.com',
            'sub' => '108120',
            'email' => 'linus@example.com',
            'email_verified' => true,
            'name' => 'Linus',
            'exp' => time() + 600,
        ]));

        $this->assertSame('google', $identity->provider);
        $this->assertSame('108120', $identity->sub);
        $this->assertSame('linus@example.com', $identity->email);
        $this->assertTrue($identity->emailVerified);
        $this->assertSame('Linus', $identity->name);
    }

    public function test_it_rejects_a_token_for_a_different_audience(): void
    {
        $this->fakeGoogleJwks();

        $this->expectException(ValidationException::class);
        app(OAuthVerifier::class)->google($this->token([
            'iss' => 'https://accounts.google.com',
            'aud' => 'some-other-app.apps.googleusercontent.com',
            'sub' => '1',
            'exp' => time() + 600,
        ]));
    }

    public function test_it_rejects_a_token_from_an_unexpected_issuer(): void
    {
        $this->fakeGoogleJwks();

        $this->expectException(ValidationException::class);
        app(OAuthVerifier::class)->google($this->token([
            'iss' => 'https://evil.example.com',
            'aud' => 'web-client-id.apps.googleusercontent.com',
            'sub' => '1',
            'exp' => time() + 600,
        ]));
    }

    public function test_it_rejects_a_token_signed_by_the_wrong_key(): void
    {
        $this->fakeGoogleJwks();
        $wrong = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($wrong, $wrongPem);

        $forged = JWT::encode([
            'iss' => 'https://accounts.google.com',
            'aud' => 'web-client-id.apps.googleusercontent.com',
            'sub' => '1',
            'exp' => time() + 600,
        ], $wrongPem, 'RS256', $this->key['kid']);

        $this->expectException(ValidationException::class);
        app(OAuthVerifier::class)->google($forged);
    }
}
