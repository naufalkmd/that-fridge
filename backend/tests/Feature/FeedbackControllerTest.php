<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class FeedbackControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_requires_authentication(): void
    {
        $this->postJson('/api/feedback', ['email' => 'a@b.com', 'message' => 'hi'])
            ->assertStatus(401);
    }

    public function test_store_validates_email_and_message(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/feedback', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'message']);
    }

    public function test_store_creates_feedback_and_sends_a_notification_email(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/feedback', [
            'email' => 'reply-to-me@example.com',
            'message' => 'The barcode scanner is great!',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('feedback', [
            'user_id' => $user->id,
            'email' => 'reply-to-me@example.com',
            'message' => 'The barcode scanner is great!',
        ]);
        Mail::assertSent(\App\Mail\FeedbackSubmittedMail::class);
    }
}
