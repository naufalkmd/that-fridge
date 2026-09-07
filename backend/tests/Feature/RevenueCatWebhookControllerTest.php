<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RevenueCatWebhookControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_rejects_a_missing_authorization_header(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            ],
        ]);

        $response->assertStatus(401);
        $this->assertNull($user->fresh()->pro_expires_at);
    }

    public function test_webhook_rejects_the_wrong_secret(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            ],
        ], ['Authorization' => 'not-the-secret']);

        $response->assertStatus(401);
        $this->assertNull($user->fresh()->pro_expires_at);
    }

    public function test_webhook_sets_pro_expires_at_from_a_valid_event(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();
        $expiresAtMs = now()->addMonth()->getTimestampMs();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'type' => 'INITIAL_PURCHASE',
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                'expiration_at_ms' => $expiresAtMs,
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertTrue($user->fresh()->isPro());
    }

    public function test_webhook_expiring_the_entitlement_makes_the_user_no_longer_pro(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'type' => 'EXPIRATION',
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                'expiration_at_ms' => now()->subDay()->getTimestampMs(),
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertFalse($user->fresh()->isPro());
    }

    public function test_webhook_grants_non_expiring_pro_when_the_event_carries_no_expiration(): void
    {
        // A RevenueCat dashboard/API "Grant Entitlement" with no end date (or a lifetime
        // non-consumable) sends the entitlement with no `expiration_at_ms` at all - which
        // used to be silently ignored, leaving the server still enforcing the free quota.
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'type' => 'NON_RENEWING_PURCHASE',
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                // no expiration_at_ms
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertTrue($user->fresh()->isPro());
        $this->assertTrue($user->fresh()->pro_expires_at->year >= 2999);
    }

    public function test_webhook_does_not_grant_lifetime_pro_on_an_expiration_event_without_a_timestamp(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create(['pro_expires_at' => now()->addMonth()]);

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'type' => 'EXPIRATION',
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['thatfridge_pro'],
                // malformed: EXPIRATION should carry a past timestamp, but defend anyway
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertFalse($user->fresh()->isPro());
    }

    public function test_webhook_accepts_the_legacy_singular_entitlement_id_field(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'type' => 'INITIAL_PURCHASE',
                'app_user_id' => (string) $user->id,
                'entitlement_id' => 'thatfridge_pro',
                'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertTrue($user->fresh()->isPro());
    }

    public function test_webhook_ignores_an_event_for_an_unrelated_entitlement(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);
        $user = User::factory()->create();

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'app_user_id' => (string) $user->id,
                'entitlement_ids' => ['some_other_entitlement'],
                'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
        $this->assertNull($user->fresh()->pro_expires_at);
    }

    public function test_webhook_ignores_an_event_for_an_unknown_user_without_erroring(): void
    {
        config(['services.revenuecat.webhook_secret' => 'the-real-secret']);

        $response = $this->postJson('/api/webhooks/revenuecat', [
            'event' => [
                'app_user_id' => '999999',
                'entitlement_ids' => ['thatfridge_pro'],
                'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            ],
        ], ['Authorization' => 'the-real-secret']);

        $response->assertStatus(200);
    }
}
