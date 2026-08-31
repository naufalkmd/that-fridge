<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\OAuth\OAuthIdentity;
use App\Services\OAuth\OAuthVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Mockery;
use Tests\TestCase;

class SocialAuthTest extends TestCase
{
    use RefreshDatabase;

    private function fakeVerifier(string $method, OAuthIdentity $identity): void
    {
        $this->mock(OAuthVerifier::class, fn ($m) => $m->shouldReceive($method)->andReturn($identity));
    }

    public function test_first_apple_sign_in_creates_a_passwordless_account(): void
    {
        $this->fakeVerifier('apple', new OAuthIdentity('apple', 'apple-sub-1', 'ada@example.com', true));

        $response = $this->postJson('/api/auth/apple', [
            'identityToken' => 'tok',
            'name' => 'Ada Lovelace',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['user' => ['name' => 'Ada Lovelace', 'email' => 'ada@example.com']]);
        $this->assertNotNull($response->json('token'));

        $user = User::where('email', 'ada@example.com')->firstOrFail();
        $this->assertNull($user->password);
        $this->assertSame('apple', $user->oauth_provider);
        $this->assertSame('apple-sub-1', $user->oauth_sub);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNotNull($user->username);
        $this->assertDatabaseHas('notification_prefs', ['user_id' => $user->id]);
    }

    public function test_repeat_apple_sign_in_returns_the_same_account(): void
    {
        $this->fakeVerifier('apple', new OAuthIdentity('apple', 'apple-sub-1', 'ada@example.com', true));

        $first = $this->postJson('/api/auth/apple', ['identityToken' => 'tok'])->assertStatus(201);
        $second = $this->postJson('/api/auth/apple', ['identityToken' => 'tok'])->assertStatus(200);

        $this->assertSame($first->json('user.id'), $second->json('user.id'));
        $this->assertSame(1, User::count());
    }

    public function test_google_sign_in_links_to_an_existing_password_account_by_verified_email(): void
    {
        $existing = User::factory()->create([
            'email' => 'grace@example.com',
            'password' => Hash::make('secret123'),
        ]);

        $this->fakeVerifier('google', new OAuthIdentity('google', 'g-sub-9', 'grace@example.com', true, 'Grace Hopper'));

        $response = $this->postJson('/api/auth/google', ['idToken' => 'tok'])->assertStatus(200);

        $this->assertSame((string) $existing->id, $response->json('user.id'));
        $this->assertSame(1, User::count());
        $existing->refresh();
        $this->assertSame('google', $existing->oauth_provider);
        $this->assertSame('g-sub-9', $existing->oauth_sub);
        // The password still works — linking doesn't wipe it.
        $this->assertTrue(Hash::check('secret123', $existing->password));
    }

    public function test_an_unverified_email_does_not_hijack_an_existing_account(): void
    {
        User::factory()->create(['email' => 'victim@example.com', 'password' => Hash::make('secret123')]);

        $this->fakeVerifier('google', new OAuthIdentity('google', 'attacker-sub', 'victim@example.com', false, 'Not Victim'));

        $this->postJson('/api/auth/google', ['idToken' => 'tok'])->assertStatus(201);

        $victim = User::where('email', 'victim@example.com')->firstOrFail();
        $this->assertNull($victim->oauth_provider);
        $this->assertSame(2, User::count());
    }

    public function test_apple_hide_my_email_with_no_address_still_creates_an_account(): void
    {
        $this->fakeVerifier('apple', new OAuthIdentity('apple', 'private-sub', null, false, null));

        $response = $this->postJson('/api/auth/apple', ['identityToken' => 'tok', 'name' => 'Anon'])->assertStatus(201);

        $user = User::findOrFail($response->json('user.id'));
        $this->assertSame('apple_private-sub@users.thatfridge.app', $user->email);
        $this->assertNull($user->email_verified_at);
    }

    public function test_an_invalid_token_is_a_validation_error(): void
    {
        $this->mock(OAuthVerifier::class, fn ($m) => $m->shouldReceive('apple')
            ->andThrow(ValidationException::withMessages(['token' => ['bad token']])));

        $this->postJson('/api/auth/apple', ['identityToken' => 'tok'])->assertStatus(422);
    }

    public function test_apple_requires_an_identity_token(): void
    {
        $this->postJson('/api/auth/apple', [])->assertStatus(422);
    }

    public function test_password_login_rejects_a_social_only_account_without_crashing(): void
    {
        User::factory()->create([
            'email' => 'social@example.com',
            'password' => null,
            'oauth_provider' => 'google',
            'oauth_sub' => 'x',
        ]);

        $this->postJson('/api/login', ['email' => 'social@example.com', 'password' => 'anything'])
            ->assertStatus(422);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
