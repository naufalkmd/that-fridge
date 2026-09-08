<?php

namespace Tests\Feature;

use App\Models\AnalyticsEvent;
use App\Models\Fridge;
use App\Models\FridgeJoinRequest;
use App\Models\GeneratedIcon;
use App\Models\NotificationEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PruneStaleDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_deletes_analytics_events_past_the_retention_window_but_keeps_recent_ones(): void
    {
        AnalyticsEvent::create(['name' => 'old', 'occurred_at' => now()->subDays(200)]);
        AnalyticsEvent::create(['name' => 'recent', 'occurred_at' => now()->subDays(10)]);
        AnalyticsEvent::query()->where('name', 'old')->update(['created_at' => now()->subDays(200)]);

        $this->artisan('app:prune-stale-data')->assertsuccessful();

        $this->assertDatabaseMissing('analytics_events', ['name' => 'old']);
        $this->assertDatabaseHas('analytics_events', ['name' => 'recent']);
    }

    public function test_it_deletes_done_and_aged_notification_events_but_keeps_fresh_ones(): void
    {
        $fridge = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'F']);

        $doneOld = NotificationEvent::create(['fridge_id' => $fridge->id, 'kind' => 'note', 'message' => 'x', 'done' => true]);
        $doneOld->forceFill(['updated_at' => now()->subDays(90)])->saveQuietly();

        $unreadOld = NotificationEvent::create(['fridge_id' => $fridge->id, 'kind' => 'note', 'message' => 'y', 'done' => false]);
        $unreadOld->forceFill(['created_at' => now()->subDays(200)])->saveQuietly();

        $fresh = NotificationEvent::create(['fridge_id' => $fridge->id, 'kind' => 'note', 'message' => 'z', 'done' => true]);

        $this->artisan('app:prune-stale-data')->assertSuccessful();

        $this->assertDatabaseMissing('notification_events', ['id' => $doneOld->id]);
        $this->assertDatabaseMissing('notification_events', ['id' => $unreadOld->id]);
        $this->assertDatabaseHas('notification_events', ['id' => $fresh->id]);
    }

    public function test_it_deletes_old_terminal_join_requests_but_keeps_pending_and_recent(): void
    {
        $fridge = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'F']);

        $oldAccepted = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => User::factory()->create()->id, 'status' => 'accepted']);
        $oldAccepted->forceFill(['updated_at' => now()->subDays(120)])->saveQuietly();

        $oldPending = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => User::factory()->create()->id, 'status' => 'pending']);
        $oldPending->forceFill(['updated_at' => now()->subDays(120)])->saveQuietly();

        $recentDeclined = FridgeJoinRequest::create(['fridge_id' => $fridge->id, 'requester_id' => User::factory()->create()->id, 'status' => 'declined']);

        $this->artisan('app:prune-stale-data')->assertSuccessful();

        $this->assertDatabaseMissing('fridge_join_requests', ['id' => $oldAccepted->id]);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $oldPending->id]);
        $this->assertDatabaseHas('fridge_join_requests', ['id' => $recentDeclined->id]);
    }

    public function test_it_deletes_stale_scan_files_but_keeps_recent_ones(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('photos/old.jpg', 'x');
        Storage::disk('public')->put('receipts/old.jpg', 'x');
        Storage::disk('public')->put('photos/new.jpg', 'x');
        touch(Storage::disk('public')->path('photos/old.jpg'), now()->subDays(30)->getTimestamp());
        touch(Storage::disk('public')->path('receipts/old.jpg'), now()->subDays(30)->getTimestamp());

        $this->artisan('app:prune-stale-data')->assertSuccessful();

        Storage::disk('public')->assertMissing('photos/old.jpg');
        Storage::disk('public')->assertMissing('receipts/old.jpg');
        Storage::disk('public')->assertExists('photos/new.jpg');
    }

    public function test_it_deletes_orphaned_icon_files_but_keeps_referenced_ones(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('icons/orphan.png', 'x');
        Storage::disk('public')->put('icons/kept.png', 'x');
        touch(Storage::disk('public')->path('icons/orphan.png'), now()->subDays(30)->getTimestamp());
        touch(Storage::disk('public')->path('icons/kept.png'), now()->subDays(30)->getTimestamp());

        GeneratedIcon::create([
            'user_id' => User::factory()->create()->id,
            'kind' => 'icon',
            'credits' => 1,
            'prompt' => 'p',
            'image_path' => 'icons/kept.png',
            'image_url' => 'https://cdn.test/kept.png',
        ]);

        $this->artisan('app:prune-stale-data')->assertSuccessful();

        Storage::disk('public')->assertMissing('icons/orphan.png');
        Storage::disk('public')->assertExists('icons/kept.png');
    }

    public function test_dry_run_reports_without_deleting(): void
    {
        AnalyticsEvent::create(['name' => 'old', 'occurred_at' => now()->subDays(200)]);
        AnalyticsEvent::query()->update(['created_at' => now()->subDays(200)]);

        $this->artisan('app:prune-stale-data --dry-run')->assertSuccessful();

        $this->assertDatabaseHas('analytics_events', ['name' => 'old']);
    }
}
