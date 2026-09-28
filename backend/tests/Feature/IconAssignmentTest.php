<?php

namespace Tests\Feature;

use App\Filament\Pages\IconStudio;
use App\Models\Fridge;
use App\Models\GeneratedIcon;
use App\Models\IconAssignment;
use App\Models\Item;
use App\Models\Section;
use App\Models\SharedIcon;
use App\Models\User;
use App\Support\IconAssignments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class IconAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['app.admin_emails' => ['admin@example.com']]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
        $owner = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Home']);
        $this->section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
    }

    private function item(string $name, string $icon = 'generic'): Item
    {
        return $this->section->items()->create(['name' => $name, 'icon' => $icon]);
    }

    public function test_picking_a_pack_icon_updates_existing_items_and_new_ones(): void
    {
        $old = $this->item('Rambutan');
        $alreadySet = $this->item('Rambutan', 'apple');

        Livewire::actingAs($this->admin)->test(IconStudio::class)
            ->callAction('pickIcon', data: ['choice' => 'pack:berries', 'apply_existing' => true], arguments: ['name' => 'rambutan'])
            ->assertHasNoActionErrors();

        $this->assertSame('berries', $old->fresh()->icon);
        $this->assertSame('apple', $alreadySet->fresh()->icon); // an icon someone chose is kept
        $this->assertDatabaseHas('icon_assignments', ['name_key' => 'rambutan', 'icon' => 'berries']);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'assigned_icon']);

        // A new item from the app (which only knows the pack) picks it up on save.
        $this->actingAs($this->section->fridge->user)->postJson("/api/sections/{$this->section->id}/items", ['name' => 'Rambutan', 'icon' => 'generic'])
            ->assertCreated()->assertJsonPath('data.icon', 'berries');
        $this->assertSame('berries', IconAssignments::iconFor('rambutan'));
    }

    public function test_a_users_own_icon_is_promoted_to_the_shared_pack_and_used(): void
    {
        Storage::fake(config('filesystems.media_disk'));
        Storage::disk(config('filesystems.media_disk'))->put('icons/u.png', 'png');
        $gen = GeneratedIcon::create(['user_id' => $this->admin->id, 'kind' => 'icon', 'credits' => 1, 'prompt' => 'Salak', 'image_path' => 'icons/u.png', 'image_url' => 'https://cdn.test/u.png']);
        $item = $this->item('Salak');

        Livewire::actingAs($this->admin)->test(IconStudio::class)
            ->callAction('pickIcon', data: ['choice' => "gen:{$gen->id}", 'apply_existing' => true], arguments: ['name' => 'salak']);

        $shared = SharedIcon::where('source_generated_icon_id', $gen->id)->firstOrFail();
        $this->assertSame($shared->image_url, $item->fresh()->icon_url);
        $this->assertSame($shared->id, IconAssignment::where('name_key', 'salak')->value('shared_icon_id'));
    }

    public function test_the_picker_offers_users_icons_shared_icons_and_the_pack(): void
    {
        GeneratedIcon::create(['user_id' => $this->admin->id, 'kind' => 'icon', 'credits' => 1, 'prompt' => ' rambutan ', 'image_path' => 'x.png', 'image_url' => 'https://cdn.test/x.png']);

        $choices = app(IconStudio::class)->iconChoices('rambutan');

        $this->assertArrayHasKey('Made by users for this name', $choices);
        $this->assertArrayHasKey('pack:milk', $choices['Pixel pack']);
        $this->assertStringContainsString('/food-icons/icon-163.png', $choices['Pixel pack']['pack:milk']);
    }

    public function test_removing_a_pick_goes_back_to_the_pack_guess(): void
    {
        $a = IconAssignment::create(['name_key' => 'rambutan', 'icon' => 'berries']);
        IconAssignments::flush();

        Livewire::actingAs($this->admin)->test(IconStudio::class)
            ->callAction('removeAssignment', arguments: ['id' => $a->id]);

        $this->assertDatabaseMissing('icon_assignments', ['id' => $a->id]);
        $this->assertNull(IconAssignments::iconFor('rambutan'));
    }
}
