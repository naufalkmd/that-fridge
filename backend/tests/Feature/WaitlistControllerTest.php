<?php

namespace Tests\Feature;

use App\Models\AndroidWaitlistSignup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WaitlistControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_stores_a_lowercased_email_with_country_and_source(): void
    {
        $this->postJson('/api/waitlist', [
            'email' => '  Someone@Example.COM ',
            'consent' => true,
            'source' => 'landing',
        ], ['CF-IPCountry' => 'my'])
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $signup = AndroidWaitlistSignup::sole();
        $this->assertSame('someone@example.com', $signup->email);
        $this->assertSame('MY', $signup->country);
        $this->assertSame('landing', $signup->source);
        $this->assertNotNull($signup->consented_at);
    }

    public function test_unknown_or_tor_country_is_not_stored(): void
    {
        $this->postJson('/api/waitlist', ['email' => 'a@example.com', 'consent' => true], ['CF-IPCountry' => 'XX'])->assertStatus(201);
        $this->postJson('/api/waitlist', ['email' => 'b@example.com', 'consent' => true], ['CF-IPCountry' => 'T1'])->assertStatus(201);
        $this->postJson('/api/waitlist', ['email' => 'c@example.com', 'consent' => true])->assertStatus(201);

        $this->assertSame(0, AndroidWaitlistSignup::whereNotNull('country')->count());
    }

    public function test_a_repeat_email_gets_the_same_response_and_keeps_one_row(): void
    {
        $this->postJson('/api/waitlist', ['email' => 'dup@example.com', 'consent' => true, 'source' => 'landing'])->assertStatus(201);

        $this->postJson('/api/waitlist', ['email' => 'DUP@example.com', 'consent' => true, 'source' => 'faq'])
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertSame(1, AndroidWaitlistSignup::count());
        $this->assertSame('landing', AndroidWaitlistSignup::sole()->source);
    }

    public function test_invalid_email_is_rejected(): void
    {
        $this->postJson('/api/waitlist', ['email' => 'not-an-email', 'consent' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->postJson('/api/waitlist', ['email' => str_repeat('a', 250).'@example.com', 'consent' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertSame(0, AndroidWaitlistSignup::count());
    }

    public function test_consent_is_required(): void
    {
        $this->postJson('/api/waitlist', ['email' => 'a@example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['consent']);

        $this->postJson('/api/waitlist', ['email' => 'a@example.com', 'consent' => false])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['consent']);

        $this->assertSame(0, AndroidWaitlistSignup::count());
    }

    public function test_a_filled_honeypot_looks_like_success_but_stores_nothing(): void
    {
        $this->postJson('/api/waitlist', ['email' => 'bot@example.com', 'consent' => true, 'website' => 'http://spam.example'])
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertSame(0, AndroidWaitlistSignup::count());
    }

    public function test_signups_are_rate_limited_per_ip(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/waitlist', ['email' => "user{$i}@example.com", 'consent' => true])->assertStatus(201);
        }

        $this->postJson('/api/waitlist', ['email' => 'user6@example.com', 'consent' => true])->assertStatus(429);
    }

    public function test_thatfridge_com_is_an_allowed_cors_origin(): void
    {
        foreach (['https://thatfridge.com', 'https://www.thatfridge.com'] as $origin) {
            $this->call('OPTIONS', '/api/waitlist', [], [], [], [
                'HTTP_ORIGIN' => $origin,
                'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
                'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type',
            ])->assertHeader('Access-Control-Allow-Origin', $origin);
        }

        $this->call('OPTIONS', '/api/waitlist', [], [], [], [
            'HTTP_ORIGIN' => 'https://evil.example',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ])->assertHeaderMissing('Access-Control-Allow-Origin');
    }
}
