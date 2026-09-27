<?php

namespace Tests\Feature;

use App\Models\AlgoFeedbackEvent;
use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use App\Services\AlgorithmInsightsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
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
}
