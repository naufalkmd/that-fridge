<?php

namespace Tests\Feature;

use App\Filament\Resources\ExploreItemResource\Pages\CreateExploreItem;
use App\Filament\Resources\ExploreItemResource\Pages\ListExploreItems;
use App\Models\ExploreItem;
use App\Models\Fridge;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\SharedIcon;
use App\Models\User;
use App\Services\ExploreSearch;
use App\Services\MachineDraftValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class ExploreTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The migration seeds the starter templates; each test builds the catalogue it needs.
        ExploreItem::query()->delete();
    }

    private function item(string $type, string $title, array $over = []): ExploreItem
    {
        return ExploreItem::create($over + ['type' => $type, 'title' => $title, 'status' => 'published']);
    }

    private function recipe(array $over = []): Recipe
    {
        return Recipe::create($over + [
            'user_id' => null, 'name' => 'Chicken rice', 'minutes' => 30, 'category' => 'Dinner',
            'ingredients' => [['icon' => 'chicken', 'name' => 'Chicken'], ['icon' => 'rice', 'name' => 'Rice']], 'steps' => ['Cook'],
        ]);
    }

    private function browse(User $user, array $query = []): array
    {
        return $this->actingAs($user)->getJson('/api/explore?'.http_build_query($query))->assertOk()->json();
    }

    private function titles(array $res, string $key = 'items'): array
    {
        return array_column($res[$key], 'title');
    }

    // ---- search ranking ------------------------------------------------------------------

    private function rank(array $titles, string $q, array $tags = []): array
    {
        $items = collect($titles)->map(fn ($t) => new ExploreItem(['title' => $t, 'tags' => $tags[$t] ?? [], 'position' => 0]));

        return app(ExploreSearch::class)->rank($items, $q)->pluck('title')->all();
    }

    public function test_an_exact_title_beats_a_prefix_beats_a_word_inside_another_title(): void
    {
        $order = $this->rank(['Egg fried rice', 'Rice', 'Rice pudding'], 'rice');

        $this->assertSame(['Rice', 'Rice pudding', 'Egg fried rice'], $order);
    }

    public function test_every_word_must_match_and_tags_count(): void
    {
        $order = $this->rank(['Tofu stir fry', 'Chicken stir fry', 'Tofu soup'], 'tofu stir');
        $this->assertSame(['Tofu stir fry'], $order);

        $tagged = $this->rank(['Weekly check', 'Something else'], 'expiry', ['Weekly check' => ['expiry']]);
        $this->assertSame(['Weekly check'], $tagged);
    }

    public function test_plurals_prefixes_and_small_typos_still_find_things(): void
    {
        $this->assertSame(['Tomato soup'], $this->rank(['Tomato soup', 'Pea soup'], 'tomatoes'));
        $this->assertSame(['Tomato soup'], $this->rank(['Tomato soup', 'Pea soup'], 'toma'));
        $this->assertSame(['Chicken rice'], $this->rank(['Chicken rice', 'Fish curry'], 'chiken'));
        $this->assertSame([], $this->rank(['Chicken rice'], 'zzz'));
    }

    public function test_punctuation_and_case_are_ignored(): void
    {
        $this->assertSame(['Mum\'s Pad Thai'], $this->rank(['Mum\'s Pad Thai', 'Rice'], 'PAD-THAI!'));
    }

    // ---- browse / search endpoint --------------------------------------------------------

    public function test_browse_lists_published_items_with_featured_first_and_hides_the_rest(): void
    {
        $user = User::factory()->create();
        $this->item('machine', 'B template', ['position' => 2]);
        $this->item('machine', 'A template', ['position' => 1, 'featured' => true]);
        $this->item('machine', 'Hidden one', ['status' => 'hidden']);
        $this->item('machine', 'Draft one', ['status' => 'draft']);

        $res = $this->browse($user);

        $this->assertSame(['A template', 'B template'], $this->titles($res));
        $this->assertSame(['A template'], $this->titles($res, 'featured'));
    }

    public function test_search_ranks_and_returns_no_featured_block_and_type_narrows(): void
    {
        $user = User::factory()->create();
        $this->item('machine', 'Rice reminder', ['featured' => true]);
        $this->item('meal_plan', 'Rice week', ['tags' => ['rice']]);
        $this->item('machine', 'Fridge summary');

        $all = $this->browse($user, ['q' => 'rice']);
        $this->assertEqualsCanonicalizing(['Rice reminder', 'Rice week'], $this->titles($all));
        $this->assertSame([], $all['featured']);

        $this->assertSame(['Rice week'], $this->titles($this->browse($user, ['q' => 'rice', 'type' => 'meal_plan'])));
        $this->assertSame(['Fridge summary', 'Rice reminder'], $this->titles($this->browse($user, ['type' => 'machine'])));
    }

    public function test_recipes_and_icons_carry_their_details_and_broken_references_are_dropped(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe();
        $icon = SharedIcon::create(['label' => 'Tomato', 'image_path' => 'p', 'image_url' => 'https://x/tomato.png']);
        $this->item('recipe', 'Chicken rice', ['ref_id' => $recipe->id]);
        $this->item('icon', 'Tomato', ['ref_id' => $icon->id]);
        $this->item('recipe', 'Gone recipe', ['ref_id' => 99999]);
        $this->item('icon', 'Gone icon', ['ref_id' => 99999]);

        $res = $this->browse($user);
        $byTitle = collect($res['items'])->keyBy('title');

        $this->assertEqualsCanonicalizing(['Chicken rice', 'Tomato'], array_keys($byTitle->all()));
        $this->assertSame(30, $byTitle['Chicken rice']['recipe']['minutes']);
        $this->assertSame(2, $byTitle['Chicken rice']['recipe']['ingredients']);
        $this->assertSame('https://x/tomato.png', $byTitle['Tomato']['imageUrl']);
    }

    public function test_it_needs_a_signed_in_user_and_a_known_type(): void
    {
        $this->getJson('/api/explore')->assertStatus(401);
        $this->actingAs(User::factory()->create())->getJson('/api/explore?type=bogus')->assertStatus(422);
    }

    // ---- use ------------------------------------------------------------------------------

    public function test_using_a_recipe_copies_it_into_the_users_book(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe();
        $item = $this->item('recipe', 'Chicken rice', ['ref_id' => $recipe->id]);

        $res = $this->actingAs($user)->postJson("/api/explore/{$item->id}/use")->assertStatus(201);

        $copy = Recipe::where('user_id', $user->id)->first();
        $this->assertNotNull($copy);
        $this->assertSame('Chicken rice', $copy->name);
        $this->assertSame(0, (int) $copy->made_count);
        $this->assertSame((string) $copy->id, (string) $res->json('recipe.id'));
        $this->assertNull(Recipe::find($recipe->id)->user_id); // the curated original is untouched
    }

    public function test_using_a_machine_returns_its_draft_and_saves_nothing(): void
    {
        $user = User::factory()->create();
        $payload = ['name' => 'X', 'trigger' => ['type' => 'schedule', 'config' => []], 'steps' => []];
        $item = $this->item('machine', 'X', ['payload' => $payload]);

        $this->actingAs($user)->postJson("/api/explore/{$item->id}/use")
            ->assertOk()->assertJsonPath('type', 'machine')->assertJsonPath('draft.name', 'X');

        $this->assertDatabaseCount('machines', 0);
    }

    public function test_using_a_meal_plan_puts_its_meals_on_the_plan_and_skips_taken_slots(): void
    {
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $item = $this->item('meal_plan', 'Week', ['payload' => ['days' => [
            ['day' => 0, 'slot' => 'Dinner', 'title' => 'Chicken rice'],
            ['day' => 1, 'slot' => 'Dinner', 'title' => 'Fried rice'],
            ['day' => 1, 'slot' => 'Lunch', 'title' => 'Salad'],
        ]]]);
        MealEntry::create(['user_id' => $user->id, 'date' => '2026-10-06', 'slot' => 'dinner', 'title' => 'Mine', 'status' => 'planned']);

        $res = $this->actingAs($user)->postJson("/api/explore/{$item->id}/use", ['start' => '2026-10-05'])->assertStatus(201);

        $res->assertJsonCount(2, 'created')->assertJsonPath('skipped', 1);
        $this->assertDatabaseHas('meal_entries', ['date' => '2026-10-05', 'slot' => 'Dinner', 'title' => 'Chicken rice', 'fridge_id' => $fridge->id]);
        $this->assertDatabaseHas('meal_entries', ['date' => '2026-10-06', 'slot' => 'Lunch', 'title' => 'Salad']);
        $this->assertDatabaseMissing('meal_entries', ['title' => 'Fried rice']);
    }

    public function test_a_meal_plan_needs_a_start_date_and_a_fridge_the_user_is_in(): void
    {
        $user = User::factory()->create();
        $item = $this->item('meal_plan', 'Week', ['payload' => ['days' => []]]);

        $this->actingAs($user)->postJson("/api/explore/{$item->id}/use")->assertStatus(422);
        $theirs = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Theirs']);
        $this->actingAs($user)->postJson("/api/explore/{$item->id}/use", ['start' => '2026-10-05', 'fridge_id' => $theirs->id])->assertStatus(404);
    }

    public function test_hidden_items_cannot_be_used(): void
    {
        $item = $this->item('machine', 'X', ['status' => 'hidden', 'payload' => ['name' => 'X']]);

        $this->actingAs(User::factory()->create())->postJson("/api/explore/{$item->id}/use")->assertStatus(404);
    }

    // ---- seeding --------------------------------------------------------------------------

    public function test_seeding_adds_curated_recipes_icons_and_templates_but_never_touches_admin_edits(): void
    {
        $recipe = $this->recipe();
        $this->recipe(['name' => 'Private', 'user_id' => User::factory()->create()->id]);
        SharedIcon::create(['label' => 'Tomato', 'image_path' => 'p', 'image_url' => 'u']);

        $this->artisan('app:seed-explore')->assertSuccessful();

        $this->assertSame(1, ExploreItem::where('type', 'recipe')->count()); // only the curated one
        $this->assertSame(1, ExploreItem::where('type', 'icon')->count());
        $this->assertSame(3, ExploreItem::where('type', 'machine')->count());
        $this->assertSame(3, ExploreItem::where('type', 'meal_plan')->count());
        $this->assertContains('rice', ExploreItem::where('type', 'recipe')->first()->tags);

        ExploreItem::where('type', 'recipe')->update(['title' => 'Renamed by admin', 'status' => 'hidden']);
        $this->artisan('app:seed-explore')->assertSuccessful();

        $this->assertSame(1, ExploreItem::where('type', 'recipe')->count());
        $this->assertSame(['Renamed by admin', 'hidden'], [ExploreItem::where('ref_id', $recipe->id)->value('title'), ExploreItem::where('ref_id', $recipe->id)->value('status')]);
    }

    public function test_every_seeded_machine_template_is_a_valid_machine(): void
    {
        $this->artisan('app:seed-explore')->assertSuccessful();
        $user = User::factory()->create();
        Fridge::create(['user_id' => $user->id, 'name' => 'Home']);

        foreach (ExploreItem::where('type', 'machine')->get() as $item) {
            $result = app(MachineDraftValidator::class)->validate($item->payload + ['name' => $item->title], $user);
            $this->assertTrue($result['valid'], "{$item->title}: ".implode('; ', $result['errors']));
        }
    }

    // ---- admin ----------------------------------------------------------------------------

    private function asAdmin(): User
    {
        config(['app.admin_emails' => ['admin@example.com']]);
        $admin = User::factory()->create(['email' => 'admin@example.com']);
        $this->actingAs($admin);

        return $admin;
    }

    public function test_admin_lists_features_and_hides_items(): void
    {
        $this->asAdmin();
        $a = $this->item('machine', 'A', ['payload' => ['name' => 'A']]);
        $b = $this->item('machine', 'B', ['payload' => ['name' => 'B']]);

        Livewire::test(ListExploreItems::class)
            ->assertCanSeeTableRecords([$a, $b])
            ->callTableAction('toggleFeatured', $a)
            ->callTableBulkAction('hide', [$b]);

        $this->assertTrue($a->fresh()->featured);
        $this->assertSame('hidden', $b->fresh()->status);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'updated', 'subject_type' => 'ExploreItem', 'subject_id' => $a->id]);
    }

    public function test_admin_sync_adds_missing_library_rows(): void
    {
        $this->asAdmin();
        $this->recipe();

        Livewire::test(ListExploreItems::class)
            ->callTableAction('sync')
            ->assertHasNoTableActionErrors();

        $this->assertSame(1, ExploreItem::where('type', 'recipe')->count());
    }

    public function test_admin_cannot_save_a_broken_template(): void
    {
        $this->asAdmin();
        $page = Livewire::test(CreateExploreItem::class);

        $page->fillForm(['type' => 'meal_plan', 'title' => 'Bad', 'status' => 'published', 'payload' => '{"days":[{"day":99,"slot":"","title":""}]}'])
            ->call('create')->assertHasFormErrors(['payload']);
        $page->fillForm(['type' => 'meal_plan', 'title' => 'Bad', 'status' => 'published', 'payload' => 'nope'])
            ->call('create')->assertHasFormErrors(['payload']);
        $page->fillForm(['type' => 'meal_plan', 'title' => 'Good', 'status' => 'published', 'payload' => '{"days":[{"day":0,"slot":"Dinner","title":"Soup"}]}'])
            ->call('create')->assertHasNoFormErrors();

        $this->assertSame(['days' => [['day' => 0, 'slot' => 'Dinner', 'title' => 'Soup']]], ExploreItem::where('title', 'Good')->value('payload'));
        $this->assertDatabaseMissing('explore_items', ['title' => 'Bad']);
    }
}
