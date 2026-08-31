<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_emails_a_code_to_a_known_address(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/api/forgot-password', ['email' => 'ada@example.com'])->assertOk();

        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'ada@example.com']);
        Mail::assertSent(PasswordResetCodeMail::class, fn ($m) => $m->hasTo('ada@example.com'));
    }

    public function test_forgot_password_is_silent_for_an_unknown_address(): void
    {
        Mail::fake();

        $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonFragment(['message' => "If that email is registered, we've sent a reset code."]);

        $this->assertDatabaseCount('password_reset_tokens', 0);
        Mail::assertNothingSent();
    }

    public function test_a_valid_code_sets_the_new_password_and_returns_a_session(): void
    {
        $user = User::factory()->create([
            'email' => 'grace@example.com',
            'password' => Hash::make('old-password'),
        ]);
        $user->createToken('old-device'); // a session that should be revoked

        DB::table('password_reset_tokens')->insert([
            'email' => 'grace@example.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $response = $this->postJson('/api/reset-password', [
            'email' => 'grace@example.com',
            'code' => '123456',
            'password' => 'brand-new-password',
        ])->assertOk();

        $this->assertNotNull($response->json('token'));
        $this->assertSame((string) $user->id, $response->json('user.id'));

        $user->refresh();
        $this->assertTrue(Hash::check('brand-new-password', $user->password));
        $this->assertSame(1, $user->tokens()->count()); // old one gone, new one issued
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'grace@example.com']);
    }

    public function test_a_wrong_code_is_rejected(): void
    {
        User::factory()->create(['email' => 'grace@example.com', 'password' => Hash::make('old')]);
        DB::table('password_reset_tokens')->insert([
            'email' => 'grace@example.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/reset-password', [
            'email' => 'grace@example.com',
            'code' => '000000',
            'password' => 'brand-new-password',
        ])->assertStatus(422);
    }

    public function test_an_expired_code_is_rejected(): void
    {
        User::factory()->create(['email' => 'grace@example.com', 'password' => Hash::make('old')]);
        DB::table('password_reset_tokens')->insert([
            'email' => 'grace@example.com',
            'token' => Hash::make('123456'),
            'created_at' => now()->subMinutes(20),
        ]);

        $this->postJson('/api/reset-password', [
            'email' => 'grace@example.com',
            'code' => '123456',
            'password' => 'brand-new-password',
        ])->assertStatus(422);
    }

    public function test_reset_requires_an_eight_character_password(): void
    {
        $this->postJson('/api/reset-password', [
            'email' => 'grace@example.com',
            'code' => '123456',
            'password' => 'short',
        ])->assertStatus(422);
    }

    public function test_requesting_a_code_again_replaces_the_previous_one(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/api/forgot-password', ['email' => 'ada@example.com'])->assertOk();
        $this->postJson('/api/forgot-password', ['email' => 'ada@example.com'])->assertOk();

        $this->assertSame(1, DB::table('password_reset_tokens')->where('email', 'ada@example.com')->count());
    }
}
