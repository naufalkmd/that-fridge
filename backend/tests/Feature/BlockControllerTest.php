<?php

namespace Tests\Feature;

use App\Models\Block;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlockControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_blocking_requires_authentication(): void
    {
        $target = User::factory()->create(['username' => 'jordan']);

        $response = $this->postJson('/api/users/jordan/block');

        $response->assertStatus(401);
    }

    public function test_a_user_can_block_another_user(): void
    {
        $me = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);

        $response = $this->actingAs($me)->postJson('/api/users/jordan/block');

        $response->assertStatus(204);
        $this->assertDatabaseHas('blocks', ['blocker_id' => $me->id, 'blocked_id' => $target->id]);
    }

    public function test_blocking_the_same_user_twice_does_not_error(): void
    {
        $me = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);

        $this->actingAs($me)->postJson('/api/users/jordan/block')->assertStatus(204);
        $response = $this->actingAs($me)->postJson('/api/users/jordan/block');

        $response->assertStatus(204);
        $this->assertEquals(1, Block::where('blocker_id', $me->id)->where('blocked_id', $target->id)->count());
    }

    public function test_a_user_cannot_block_themselves(): void
    {
        $me = User::factory()->create(['username' => 'jordan']);

        $response = $this->actingAs($me)->postJson('/api/users/jordan/block');

        $response->assertStatus(422);
    }

    public function test_a_user_can_unblock_another_user(): void
    {
        $me = User::factory()->create();
        $target = User::factory()->create(['username' => 'jordan']);
        $me->blocking()->attach($target->id);

        $response = $this->actingAs($me)->deleteJson('/api/users/jordan/block');

        $response->assertStatus(204);
        $this->assertDatabaseMissing('blocks', ['blocker_id' => $me->id, 'blocked_id' => $target->id]);
    }

    public function test_unblocking_a_user_who_was_never_blocked_does_not_error(): void
    {
        $me = User::factory()->create();
        User::factory()->create(['username' => 'jordan']);

        $response = $this->actingAs($me)->deleteJson('/api/users/jordan/block');

        $response->assertStatus(204);
    }
}
