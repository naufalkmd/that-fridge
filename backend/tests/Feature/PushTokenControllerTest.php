<?php

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushTokenControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_stores_a_valid_expo_token(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[abc123DEF456]', 'platform' => 'ios',
        ])->assertNoContent();

        $this->assertDatabaseHas('push_tokens', [
            'user_id' => $user->id, 'token' => 'ExponentPushToken[abc123DEF456]',
        ]);
    }

    public function test_it_rejects_a_token_that_is_not_an_expo_push_token(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/push-tokens', [
            'token' => 'not-a-real-token',
        ])->assertStatus(422)->assertJsonValidationErrors('token');

        $this->assertDatabaseMissing('push_tokens', ['token' => 'not-a-real-token']);
    }

    public function test_destroy_only_removes_the_callers_own_token(): void
    {
        $mine = User::factory()->create();
        $theirs = User::factory()->create();
        PushToken::create(['user_id' => $theirs->id, 'token' => 'ExponentPushToken[theirs]']);

        $this->actingAs($mine)->deleteJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[theirs]',
        ])->assertNoContent();

        $this->assertDatabaseHas('push_tokens', ['token' => 'ExponentPushToken[theirs]']);
    }
}
