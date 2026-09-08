<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_requires_a_username(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jordan Diaz',
            'email' => 'jordan@example.com',
            'password' => 'at-least-8-chars',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('username');
    }

    public function test_register_rejects_a_duplicate_username(): void
    {
        User::factory()->create(['username' => 'jordan']);

        $response = $this->postJson('/api/register', [
            'name' => 'Someone Else',
            'username' => 'jordan',
            'email' => 'someone@example.com',
            'password' => 'at-least-8-chars',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('username');
    }

    public function test_register_returns_the_new_user_with_a_username(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jordan Diaz',
            'username' => 'jordan_diaz',
            'email' => 'jordan@example.com',
            'password' => 'at-least-8-chars',
            'dataTransferConsent' => true,
        ]);

        $response->assertStatus(201);
        $response->assertJson(['user' => ['name' => 'Jordan Diaz', 'username' => 'jordan_diaz', 'email' => 'jordan@example.com']]);
        $this->assertDatabaseHas('users', ['username' => 'jordan_diaz']);
    }

    public function test_register_is_capped_per_day_per_ip(): void
    {
        $make = fn (int $n) => $this->postJson('/api/register', [
            'name' => "User {$n}",
            'username' => "user_{$n}",
            'email' => "u{$n}@example.com",
            'password' => 'at-least-8-chars',
            'dataTransferConsent' => true,
        ]);

        // 20/day is allowed - spread past the 6/min floor with a little time travel.
        for ($i = 1; $i <= 20; $i++) {
            if ($i % 5 === 1) {
                $this->travel(2)->minutes();
            }
            $make($i)->assertStatus(201);
        }

        // The 21st from the same IP is blocked even after the per-minute window clears.
        $this->travel(2)->minutes();
        $make(21)->assertStatus(429);
    }

    public function test_register_records_when_data_transfer_consent_was_given(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jordan Diaz',
            'username' => 'jordan_diaz',
            'email' => 'jordan@example.com',
            'password' => 'at-least-8-chars',
            'dataTransferConsent' => true,
        ]);

        $response->assertStatus(201);
        $user = User::where('username', 'jordan_diaz')->firstOrFail();
        $this->assertNotNull($user->data_transfer_consented_at);
    }

    public function test_register_requires_data_transfer_consent(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jordan Diaz',
            'username' => 'jordan_diaz',
            'email' => 'jordan@example.com',
            'password' => 'at-least-8-chars',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('dataTransferConsent');
        $this->assertDatabaseMissing('users', ['username' => 'jordan_diaz']);
    }

    public function test_register_rejects_data_transfer_consent_set_to_false(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jordan Diaz',
            'username' => 'jordan_diaz',
            'email' => 'jordan@example.com',
            'password' => 'at-least-8-chars',
            'dataTransferConsent' => false,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('dataTransferConsent');
    }

    public function test_login_and_me_return_the_username(): void
    {
        $user = User::factory()->create(['username' => 'jordan', 'email' => 'jordan@example.com']);

        $loginResponse = $this->postJson('/api/login', ['email' => 'jordan@example.com', 'password' => 'password']);
        $loginResponse->assertStatus(200);
        $loginResponse->assertJson(['user' => ['username' => 'jordan']]);

        $meResponse = $this->actingAs($user)->getJson('/api/me');
        $meResponse->assertStatus(200);
        $meResponse->assertJson(['user' => ['username' => 'jordan']]);
    }

    public function test_login_locks_the_account_after_five_wrong_passwords(): void
    {
        User::factory()->create(['email' => 'jordan@example.com']); // factory password: "password"

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'jordan@example.com', 'password' => 'wrong'])
                ->assertStatus(422);
        }

        // Locked: even the correct password is refused now.
        $this->postJson('/api/login', ['email' => 'jordan@example.com', 'password' => 'password'])
            ->assertStatus(422)
            ->assertJsonFragment(['email' => ['Too many failed attempts. Try again in a few minutes.']]);
    }

    public function test_onboarding_merges_preference_tags_and_returns_them(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/me/onboarding', [
            'goal' => 'save_money',
            'household' => 'roommates',
        ]);
        $first->assertStatus(200);
        $first->assertJson(['user' => ['preferences' => ['goal' => 'save_money', 'household' => 'roommates']]]);

        // A later call merges rather than replaces.
        $this->actingAs($user)->postJson('/api/me/onboarding', ['waste_frequency' => 'weekly'])
            ->assertStatus(200);

        $this->assertSame(
            ['goal' => 'save_money', 'household' => 'roommates', 'waste_frequency' => 'weekly'],
            $user->fresh()->preferences,
        );
    }

    public function test_onboarding_accepts_an_empty_body_for_a_user_who_skipped_the_questions(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/me/onboarding', [])->assertStatus(200);
    }

    public function test_onboarding_rejects_a_tag_outside_the_known_set(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/me/onboarding', ['goal' => 'get_rich'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('goal');
    }

    public function test_onboarding_requires_auth(): void
    {
        $this->postJson('/api/me/onboarding', ['goal' => 'save_money'])->assertStatus(401);
    }

    public function test_update_profile_changes_name_and_username_and_logs_them(): void
    {
        $user = User::factory()->create(['name' => 'Jordan', 'username' => 'jordan']);

        $response = $this->actingAs($user)->patchJson('/api/me/profile', [
            'name' => 'Jordan Diaz',
            'username' => 'jordandiaz',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['user' => ['name' => 'Jordan Diaz', 'username' => 'jordandiaz']]);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Jordan Diaz', 'username' => 'jordandiaz']);
        $this->assertDatabaseHas('user_profile_changes', [
            'user_id' => $user->id, 'field' => 'username', 'old_value' => 'jordan', 'new_value' => 'jordandiaz',
        ]);
    }

    public function test_update_profile_reports_remaining_changes(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'freshhandle']);

        $response->assertStatus(200);
        $response->assertJson(['user' => ['profileChanges' => [
            'username' => ['limit' => 1, 'remaining' => 0],
            'name' => ['limit' => 3, 'remaining' => 3],
        ]]]);
        $this->assertNotNull($response->json('user.profileChanges.username.nextAllowedAt'));
    }

    public function test_update_profile_blocks_a_username_change_once_the_monthly_limit_is_spent(): void
    {
        $user = User::factory()->create(['username' => 'jordan']);

        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'jordan2'])->assertStatus(200);

        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'jordan3'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');

        $this->assertSame('jordan2', $user->fresh()->username);
    }

    public function test_update_profile_allows_a_second_name_change_within_the_month(): void
    {
        $user = User::factory()->create(['name' => 'A']);

        $this->actingAs($user)->patchJson('/api/me/profile', ['name' => 'B'])->assertStatus(200);
        $this->actingAs($user)->patchJson('/api/me/profile', ['name' => 'C'])->assertStatus(200);
        $this->actingAs($user)->patchJson('/api/me/profile', ['name' => 'D'])->assertStatus(200);
        $this->actingAs($user)->patchJson('/api/me/profile', ['name' => 'E'])->assertStatus(422);
    }

    public function test_update_profile_does_not_spend_a_slot_when_the_value_is_unchanged(): void
    {
        $user = User::factory()->create(['username' => 'jordan']);

        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'jordan'])->assertStatus(200);

        $this->assertDatabaseCount('user_profile_changes', 0);
        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'jordan_new'])->assertStatus(200);
    }

    public function test_update_profile_rejects_a_taken_username(): void
    {
        $user = User::factory()->create();
        User::factory()->create(['username' => 'taken']);

        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'taken'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');
    }

    public function test_update_profile_is_forbidden_for_a_managed_demo_account(): void
    {
        $user = User::factory()->create(['is_demo' => true, 'username' => 'keira']);

        $this->actingAs($user)->patchJson('/api/me/profile', ['username' => 'keira_new'])
            ->assertStatus(403);

        $this->assertSame('keira', $user->fresh()->username);
    }

    public function test_update_profile_requires_auth(): void
    {
        $this->patchJson('/api/me/profile', ['name' => 'X'])->assertStatus(401);
    }

    public function test_delete_me_removes_the_user_their_tokens_and_owned_fridges(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('t')->plainTextToken;
        $fridge = $user->fridges()->create(['name' => 'Home']);

        $response = $this->withHeader('Authorization', "Bearer {$token}")->deleteJson('/api/me');

        $response->assertStatus(200);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('fridges', ['id' => $fridge->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_delete_me_requires_auth(): void
    {
        $this->deleteJson('/api/me')->assertStatus(401);
    }
}
