<?php

namespace Tests\Feature;

use App\Filament\Pages\IconStudio;
use App\Models\AlgoFeedbackEvent;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Section;
use App\Models\User;
use App\Services\AlgorithmInsightsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Livewire\Livewire;
use Tests\TestCase;

class IconMissesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['app.algo_feedback_enabled' => true, 'app.admin_emails' => ['admin@example.com']]);
    }

    private function addItem(User $user, string $name, string $icon = 'generic', ?string $iconUrl = null): void
    {
        $fridge = Fridge::firstOrCreate(['user_id' => $user->id], ['name' => 'Home']);
        $section = Section::firstOrCreate(['fridge_id' => $fridge->id], ['name' => 'Top']);
        $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", array_filter([
            'name' => $name, 'icon' => $icon, 'icon_url' => $iconUrl,
        ]))->assertCreated();
    }

    public function test_an_item_saved_without_a_pack_icon_is_recorded_as_a_miss(): void
    {
        $user = User::factory()->create();

        $this->addItem($user, 'Rambutan');
        $this->addItem($user, 'Milk', 'milk'); // the pack has it: not a miss

        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'icon', 'kind' => 'miss', 'name_key' => 'rambutan', 'source' => 'generic']);
        $this->assertSame(1, AlgoFeedbackEvent::where('kind', 'miss')->count());
    }

    public function test_the_list_shows_a_name_once_three_people_added_it_and_counts_the_rest(): void
    {
        foreach (range(1, 3) as $i) {
            $this->addItem(User::factory()->create(), 'Rambutan');
        }
        $this->addItem(User::factory()->create(), 'Salak');

        $misses = app(AlgorithmInsightsReport::class)->iconMisses();

        $this->assertSame(['rambutan'], array_column($misses['rows'], 'name_key'));
        $this->assertSame(3, $misses['rows'][0]['users']);
        $this->assertSame(1, $misses['hidden']); // salak: only one person so far
    }

    public function test_the_admin_page_lists_them_with_a_link_to_make_the_icon(): void
    {
        foreach (range(1, 3) as $i) {
            $this->addItem(User::factory()->create(), 'Rambutan');
        }
        $admin = User::factory()->create(['email' => 'admin@example.com']);

        $this->actingAs($admin, 'web')->get('/admin/algorithm-insights')
            ->assertOk()
            ->assertSee('Items with no icon')
            ->assertSee('rambutan')
            ->assertSee('icon-studio?prompt=rambutan', false);

        $this->actingAs($admin, 'web')->get('/admin/icon-studio?prompt=rambutan')->assertOk()->assertSee('rambutan');
    }

    public function test_changing_the_icon_the_app_chose_records_a_mismatch_with_the_name(): void
    {
        $user = User::factory()->create();
        $this->addItem($user, 'Cheddar', 'cheese');
        $item = Item::where('name', 'Cheddar')->firstOrFail();

        $this->actingAs($user)->patchJson("/api/items/{$item->id}", ['icon' => 'icon5'])->assertOk();

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'icon', 'kind' => 'mismatch', 'name_key' => 'cheddar', 'guess' => 'cheese', 'final' => 'icon5', 'source' => 'user_edit',
        ]);
    }

    public function test_picking_a_different_icon_when_adding_also_counts(): void
    {
        $user = User::factory()->create();

        $this->addItem($user, 'Cheddar', 'icon5'); // the app would have shown the cheese icon

        $this->assertDatabaseHas('algo_feedback_events', ['kind' => 'mismatch', 'name_key' => 'cheddar', 'guess' => 'cheese', 'final' => 'icon5', 'source' => 'on_add']);
    }

    public function test_icon_studio_suggests_names_people_could_not_get_right_and_fills_the_prompt(): void
    {
        foreach (range(1, 3) as $i) {
            $this->addItem(User::factory()->create(), 'Rambutan');
            $this->addItem(User::factory()->create(), 'Cheddar', 'icon5');
        }
        $admin = User::factory()->create(['email' => 'admin@example.com']);

        $s = app(AlgorithmInsightsReport::class)->iconSuggestions();
        $byName = collect($s['rows'])->keyBy('name_key');
        $this->assertSame('No icon', $byName['rambutan']['reason']);
        $this->assertSame('Wrong icon', $byName['cheddar']['reason']);
        $this->assertSame('icon5', $byName['cheddar']['picked']);

        $this->actingAs($admin, 'web')->get('/admin/icon-studio')->assertOk()->assertSee('Suggested by users')->assertSee('rambutan');

        Livewire::actingAs($admin)->test(IconStudio::class)
            ->call('useSuggestion', 'rambutan')
            ->assertSet('data.prompt', 'rambutan');
    }
}
