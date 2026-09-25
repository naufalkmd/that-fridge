<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use App\Support\ItemRemovalOutcome;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemRemovalTest extends TestCase
{
    use RefreshDatabase;

    private function item(User $user, array $attrs = [], int $ageDays = 2): Item
    {
        $fridge = Fridge::firstOrCreate(['user_id' => $user->id], ['name' => 'Home']);
        $section = Section::firstOrCreate(['fridge_id' => $fridge->id], ['name' => 'Top']);
        $item = $section->items()->create(array_merge([
            'name' => 'Milk', 'icon' => 'milk', 'nutrition_category' => 'dairy',
            'expiry_date' => now()->addDays(2)->toDateString(), 'shelf_life_days' => 7,
        ], $attrs));
        $item->forceFill(['created_at' => now()->subDays($ageDays)])->saveQuietly();

        return $item->fresh();
    }

    public function test_classifier_handles_age_expiry_missing_date_and_explicit_contexts(): void
    {
        $user = User::factory()->create();
        $recent = $this->item($user, [], 0);
        $expired = $this->item($user, ['expiry_date' => now()->subDay()->toDateString()]);
        $noDate = $this->item($user, ['expiry_date' => null]);

        $this->assertSame('entry_mistake', ItemRemovalOutcome::classify($recent)['outcome']);
        $this->assertSame('wasted', ItemRemovalOutcome::classify($expired)['outcome']);
        $this->assertSame('used', ItemRemovalOutcome::classify($noDate)['outcome']);
        $this->assertSame('low', ItemRemovalOutcome::classify($noDate)['confidence']);
        $this->assertSame('used', ItemRemovalOutcome::classify($expired, 'machine_used')['outcome']);
        $this->assertSame('wasted', ItemRemovalOutcome::classify($recent, 'clear_expired')['outcome']);

        $opened = $this->item($user, [
            'name' => 'Milk', 'expiry_date' => now()->addMonth()->toDateString(),
        ]);
        $opened->update(['opened' => true]);
        $opened->forceFill(['opened_at' => now()->subDays(9)])->saveQuietly();
        $this->assertSame('wasted', ItemRemovalOutcome::classify($opened->fresh())['outcome']);
    }

    public function test_delete_correct_and_undo_adjust_usage_once_and_restore_the_item(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $item = $this->item($user, ['note' => 'For Sunday']);

        $response = $this->actingAs($user)->deleteJson("/api/items/{$item->id}")->assertOk();
        $id = $response->json('id');
        $this->assertSame('used', $response->json('outcome'));
        $this->assertDatabaseHas('usage_history', ['user_id' => $user->id, 'key' => 'milk', 'count' => 1]);
        $this->assertDatabaseHas('item_outcomes', ['id' => $id, 'outcome' => 'used']);

        $this->patchJson("/api/item-outcomes/{$id}", ['outcome' => 'wasted'])->assertOk();
        $this->assertDatabaseMissing('usage_history', ['user_id' => $user->id, 'key' => 'milk']);
        $this->patchJson("/api/item-outcomes/{$id}", ['outcome' => 'wasted'])->assertOk();
        $this->assertDatabaseMissing('usage_history', ['user_id' => $user->id, 'key' => 'milk']);

        $this->postJson("/api/item-outcomes/{$id}/undo")->assertOk();
        $this->assertDatabaseHas('items', ['name' => 'Milk', 'note' => 'For Sunday']);
        $this->assertDatabaseHas('item_outcomes', ['id' => $id, 'outcome' => 'wasted']);
        $this->postJson("/api/item-outcomes/{$id}/undo")->assertNotFound();
    }

    public function test_badge_requires_an_item_at_least_one_day_old(): void
    {
        $user = User::factory()->create();
        $new = $this->item($user, [], 0);
        $old = $this->item($user, [], 2);

        $this->actingAs($user)->deleteJson("/api/items/{$new->id}?context=recipe_used")->assertOk();
        $this->assertDatabaseMissing('user_badges', ['user_id' => $user->id, 'badge_key' => 'rescued_10']);
        $this->deleteJson("/api/items/{$old->id}?context=recipe_used")->assertOk();
        $this->assertDatabaseHas('user_badges', ['user_id' => $user->id, 'badge_key' => 'rescued_10', 'progress' => 1]);
    }

    public function test_users_cannot_change_or_undo_someone_elses_removal(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $item = $this->item($owner);
        $id = $this->actingAs($owner)->deleteJson("/api/items/{$item->id}")->json('id');

        $this->actingAs($other)->patchJson("/api/item-outcomes/{$id}", ['outcome' => 'wasted'])->assertNotFound();
        $this->postJson("/api/item-outcomes/{$id}/undo")->assertNotFound();
    }

    public function test_undo_preserves_the_opening_snapshot_and_date(): void
    {
        $user = User::factory()->create();
        $item = $this->item($user, ['name' => 'Jam', 'icon' => 'jam']);
        $item->update(['opened' => true]);
        $openedAt = $item->fresh()->opened_at;
        $id = $this->actingAs($user)->deleteJson("/api/items/{$item->id}")->assertOk()->json('id');

        $response = $this->postJson("/api/item-outcomes/{$id}/undo")->assertOk();
        $this->assertSame(30, $response->json('data.opened_shelf_life_days'));
        $this->assertSame('rule', $response->json('data.opened_shelf_life_source'));
        $restored = Item::findOrFail($response->json('data.id'));
        $this->assertTrue($restored->opened);
        $this->assertSame($openedAt->toISOString(), $restored->opened_at->toISOString());
    }
}
