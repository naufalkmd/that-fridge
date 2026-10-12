<?php

namespace Tests\Feature;

use App\Mail\AiOutageNoticeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EmailAiOutageNoticeTest extends TestCase
{
    use RefreshDatabase;

    public function test_without_send_it_is_a_dry_run(): void
    {
        Mail::fake();
        User::factory()->count(2)->create();

        $this->artisan('app:email-ai-outage-notice')
            ->expectsOutputToContain('2 real user(s)')
            ->assertSuccessful();

        Mail::assertNothingSent();
    }

    public function test_to_sends_a_single_test_copy_from_support(): void
    {
        Mail::fake();
        User::factory()->create();

        $this->artisan('app:email-ai-outage-notice', ['--to' => 'me@example.com'])->assertSuccessful();

        Mail::assertSentCount(1);
        Mail::assertSent(AiOutageNoticeMail::class, fn ($mail) => $mail->hasTo('me@example.com') && $mail->hasFrom('support@thatfridge.com'));
    }

    public function test_send_emails_real_users_once_and_skips_demo_accounts(): void
    {
        Mail::fake();
        $real = User::factory()->count(2)->create();
        $demo = User::factory()->create(['is_demo' => true]);

        $run = fn () => $this->artisan('app:email-ai-outage-notice', ['--send' => true, '--pause' => 0])
            ->expectsConfirmation('Email the notice to 2 user(s) from support@thatfridge.com?', 'yes')
            ->assertSuccessful();

        $run();
        Mail::assertSentCount(2);
        foreach ($real as $user) {
            Mail::assertSent(AiOutageNoticeMail::class, fn ($mail) => $mail->hasTo($user->email));
        }
        Mail::assertNotSent(AiOutageNoticeMail::class, fn ($mail) => $mail->hasTo($demo->email));

        // A second run finds everyone already sent.
        $run();
        Mail::assertSentCount(2);
    }

    public function test_declining_the_confirmation_sends_nothing(): void
    {
        Mail::fake();
        User::factory()->create();

        $this->artisan('app:email-ai-outage-notice', ['--send' => true])
            ->expectsConfirmation('Email the notice to 1 user(s) from support@thatfridge.com?', 'no')
            ->assertSuccessful();

        Mail::assertNothingSent();
    }

    public function test_the_email_says_what_happened_without_saying_why(): void
    {
        $html = (new AiOutageNoticeMail)->render();

        $this->assertStringContainsString('AI features had stopped working', $html);
        $this->assertStringContainsString('The problem was on our side', $html);
        $this->assertStringContainsString('fixed now', $html);
        $this->assertStringContainsString('improved our system', $html);
        $this->assertStringContainsString('went straight back to your balance', $html);
        $this->assertStringNotContainsStringIgnoringCase('openrouter', $html);
        $this->assertStringNotContainsStringIgnoringCase('thanks', $html);
    }
}
