<?php

namespace Tests\Feature;

use App\Mail\AiHealthAlertMail;
use App\Models\ApiUsageLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class CheckAiHealthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Mail::fake();
        config(['services.openrouter.key' => 'k', 'services.ai_alerts.to' => 'ops@example.com', 'services.ai_alerts.low_balance_usd' => 5]);
    }

    /** A healthy account unless a test says otherwise: $20 left, no key limit. */
    private function openRouterHas(?float $balance = 20, ?float $keyLimit = null, ?float $keyRemaining = null): void
    {
        Http::fake([
            'openrouter.ai/api/v1/credits' => $balance === null
                ? Http::response([], 403)
                : Http::response(['data' => ['total_credits' => 100, 'total_usage' => 100 - $balance]], 200),
            'openrouter.ai/api/v1/key' => Http::response(['data' => ['usage' => 1, 'limit' => $keyLimit, 'limit_remaining' => $keyRemaining]], 200),
        ]);
    }

    private function aiCall(bool $ok, ?string $reason = null, ?\DateTimeInterface $at = null): void
    {
        ApiUsageLog::forceCreate(['provider' => 'openrouter', 'feature' => 'Quick Chat', 'ok' => $ok, 'reason' => $reason, 'created_at' => $at ?? now()]);
    }

    private function check(): void
    {
        $this->artisan('app:check-ai-health')->assertSuccessful();
    }

    public function test_a_healthy_app_sends_nothing(): void
    {
        $this->openRouterHas();
        $this->aiCall(true);

        $this->check();

        Mail::assertNothingSent();
    }

    public function test_one_refused_call_is_enough_to_warn_and_it_warns_once(): void
    {
        // The October 2026 outage: the key hit its spending limit, every call came back 403.
        $this->openRouterHas();
        $this->aiCall(true);
        $this->aiCall(false, 'forbidden');

        $this->check();
        $this->check();

        Mail::assertSentCount(1);
        Mail::assertSent(AiHealthAlertMail::class, fn ($mail) => $mail->hasTo('ops@example.com')
            && $mail->heading === 'AI calls are failing'
            && str_contains($mail->lines[0], 'spending limit'));
    }

    public function test_it_warns_again_after_the_problem_clears_and_comes_back(): void
    {
        $this->openRouterHas();
        $this->aiCall(false, 'forbidden');
        $this->check();

        $this->aiCall(true); // fixed
        $this->check();
        Mail::assertSentCount(1);

        $this->aiCall(false, 'out_of_credits');
        $this->check();
        Mail::assertSentCount(2);
    }

    public function test_other_failures_warn_only_after_three_in_a_row(): void
    {
        $this->openRouterHas();
        $this->aiCall(false, 'exception');
        $this->aiCall(false, 'server_error');
        $this->check();
        Mail::assertNothingSent();

        $this->aiCall(false, 'exception');
        $this->check();
        Mail::assertSentCount(1);
    }

    public function test_a_success_among_the_last_three_calls_is_not_an_outage(): void
    {
        $this->openRouterHas();
        $this->aiCall(false, 'exception');
        $this->aiCall(false, 'exception');
        $this->aiCall(true);
        $this->aiCall(false, 'rate_limited');

        $this->check();

        Mail::assertNothingSent();
    }

    public function test_failures_older_than_a_day_do_not_warn(): void
    {
        $this->openRouterHas();
        $this->aiCall(false, 'forbidden', now()->subDays(2));

        $this->check();

        Mail::assertNothingSent();
    }

    public function test_a_low_balance_warns_with_the_amount_left(): void
    {
        $this->openRouterHas(balance: 4.2);

        $this->check();
        $this->check();

        Mail::assertSentCount(1);
        Mail::assertSent(AiHealthAlertMail::class, fn ($mail) => $mail->heading === 'OpenRouter balance is low ($4.20 left)');
    }

    public function test_a_key_limit_warns_at_a_fifth_remaining(): void
    {
        $this->openRouterHas(keyLimit: 5, keyRemaining: 0.8);

        $this->check();

        Mail::assertSentCount(1);
        Mail::assertSent(AiHealthAlertMail::class, fn ($mail) => $mail->heading === 'OpenRouter key limit is nearly reached ($0.80 of $5.00 left)');
    }

    public function test_a_key_limit_with_room_left_and_an_unreadable_balance_send_nothing(): void
    {
        $this->openRouterHas(balance: null, keyLimit: 5, keyRemaining: 3);

        $this->check();

        Mail::assertNothingSent();
    }

    public function test_each_problem_gets_its_own_warning(): void
    {
        $this->openRouterHas(balance: 1, keyLimit: 5, keyRemaining: 0);
        $this->aiCall(false, 'forbidden');

        $this->check();

        Mail::assertSentCount(3);
    }

    public function test_without_an_api_key_it_does_nothing(): void
    {
        config(['services.openrouter.key' => null]);

        $this->check();

        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_the_email_reads_as_a_heading_and_paragraphs(): void
    {
        $html = (new AiHealthAlertMail('OpenRouter balance is low ($4.20 left)', ['First line.', 'Add credit at https://openrouter.ai/settings/credits.']))->render();

        $this->assertStringContainsString('OpenRouter balance is low ($4.20 left)', $html);
        $this->assertStringContainsString('First line.', $html);
        $this->assertStringContainsString('https://openrouter.ai/settings/credits', $html);
    }
}
