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
        ]);

        $response->assertStatus(201);
        $response->assertJson(['user' => ['name' => 'Jordan Diaz', 'username' => 'jordan_diaz', 'email' => 'jordan@example.com']]);
        $this->assertDatabaseHas('users', ['username' => 'jordan_diaz']);
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
}
