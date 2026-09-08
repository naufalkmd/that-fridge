<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientCreditsException;
use App\Models\User;
use App\Services\CreditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CreditServiceTest extends TestCase
{
    use RefreshDatabase;

    private CreditService $credits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->credits = app(CreditService::class);
    }

    public function test_spend_debits_the_balance_and_writes_a_ledger_row(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);

        $this->credits->spend($user, 3, 'chat');

        $this->assertSame(7, $user->fresh()->ai_credits);
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'delta' => -3, 'balance_after' => 7, 'reason' => 'chat']);
    }

    public function test_spend_throws_when_short_and_leaves_the_balance_untouched(): void
    {
        $user = User::factory()->create(['ai_credits' => 2]);

        try {
            $this->credits->spend($user, 3, 'icon');
            $this->fail('expected InsufficientCreditsException');
        } catch (InsufficientCreditsException $e) {
            $this->assertSame(2, $e->balance);
            $this->assertSame(3, $e->needed);
        }

        $this->assertSame(2, $user->fresh()->ai_credits);
        $this->assertDatabaseCount('ai_credit_ledger', 0);
    }

    public function test_spend_up_to_never_fails_and_charges_what_it_can(): void
    {
        $user = User::factory()->create(['ai_credits' => 1]);

        $charged = $this->credits->spendUpTo($user, 3, 'chat_tools');

        $this->assertSame(1, $charged);
        $this->assertSame(0, $user->fresh()->ai_credits);
    }

    public function test_grant_is_idempotent_on_ref(): void
    {
        $user = User::factory()->create(['ai_credits' => 0]);

        $this->assertTrue($this->credits->grant($user, 100, 'pack_purchase', 'evt_1'));
        $this->assertFalse($this->credits->grant($user, 100, 'pack_purchase', 'evt_1'));

        $this->assertSame(100, $user->fresh()->ai_credits);
        $this->assertDatabaseCount('ai_credit_ledger', 1);
    }

    public function test_grant_respects_the_rollover_cap(): void
    {
        $user = User::factory()->create(['ai_credits' => 700]);

        $this->credits->grant($user, 400, 'pro_grant', 'r1', 800);

        $this->assertSame(800, $user->fresh()->ai_credits); // capped, not 1100
    }

    public function test_grant_above_the_cap_is_a_no_op(): void
    {
        $user = User::factory()->create(['ai_credits' => 900]);

        $this->credits->grant($user, 400, 'pro_grant', 'r2', 800);

        $this->assertSame(900, $user->fresh()->ai_credits); // already over the cap, untouched
    }
}
