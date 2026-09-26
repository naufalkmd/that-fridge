<?php

namespace Tests\Feature;

use App\Filament\Pages\IconStudio;
use App\Filament\Pages\RecipeStudio;
use App\Models\ApiUsageLog;
use App\Models\ExploreItem;
use App\Models\GeneratedIcon;
use App\Models\Recipe;
use App\Models\SharedIcon;
use App\Models\User;
use App\Services\AgentService;
use App\Services\FalClient;
use App\Services\OpenRouterClient;
use App\Support\ApiUsageFeature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class AdminStudiosTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.admin_emails' => ['admin@example.com']]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
        $this->actingAs($this->admin);
        Recipe::query()->delete();
        ExploreItem::query()->delete();
    }

    private function chefReplies(array|string $content): void
    {
        $this->mock(OpenRouterClient::class, function ($m) use ($content) {
            $m->shouldReceive('available')->andReturn(true);
            $m->shouldReceive('complete')->andReturn(['ok' => true, 'content' => is_array($content) ? json_encode($content) : $content]);
        });
        $this->mock(AgentService::class, fn ($m) => $m->shouldReceive('tagRecipe')->andReturn(['meal_type' => 'dinner', 'vibes' => ['quick_easy'], 'food_focus' => ['high_protein']]));
    }

    private function nasiLemak(): array
    {
        return [
            'found' => true, 'name' => 'Nasi lemak', 'minutes' => 35, 'category' => 'dinner',
            'ingredients' => [['name' => 'Rice'], ['name' => 'Eggs'], ['name' => 'Anchovies']],
            'steps' => ['Cook the rice in coconut milk.', 'Fry the eggs.'],
        ];
    }

    private function fakeIcons(): void
    {
        Storage::fake('public');
        $img = imagecreatetruecolor(64, 64);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 80, 40));
        ob_start();
        imagepng($img);
        Http::fake(['cdn.test/*' => Http::response(ob_get_clean(), 200, ['Content-Type' => 'image/png'])]);
        $this->mock(FalClient::class, function ($m) {
            $m->shouldReceive('available')->andReturn(true);
            $m->shouldReceive('generate')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/raw.png']);
            $m->shouldReceive('removeBackground')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/cutout.png']);
        });
    }

    // ---- recipe studio -----------------------------------------------------------------------------

    public function test_both_studios_are_reachable_from_the_admin_panel(): void
    {
        $this->get('/admin/recipe-studio')->assertOk()->assertSee('Recipe studio');
        $this->get('/admin/icon-studio')->assertOk()->assertSee('Icon studio');
    }

    public function test_a_non_admin_cannot_open_the_studios(): void
    {
        $this->actingAs(User::factory()->create(['email' => 'someone@example.com']));

        $this->get('/admin/recipe-studio')->assertForbidden();
        $this->get('/admin/icon-studio')->assertForbidden();
    }

    public function test_chef_writes_a_draft_that_fills_the_review_form_with_guessed_icons(): void
    {
        $this->chefReplies($this->nasiLemak());

        $page = Livewire::test(RecipeStudio::class)
            ->fillForm(['prompt' => 'Nasi lemak for two'])->call('generate');

        $page->assertSet('hasDraft', true)->assertFormSet(['name' => 'Nasi lemak', 'minutes' => 35, 'category' => 'dinner']);
        $ingredients = array_values($page->get('data.ingredients'));
        $this->assertSame(['Rice', 'Eggs', 'Anchovies'], array_column($ingredients, 'name'));
        $this->assertSame('eggs', $ingredients[1]['icon']);
        $this->assertNotEmpty($ingredients[2]['icon']); // unknown food still gets an icon key
        $this->assertSame(0, Recipe::count()); // nothing saved until "Save"
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'generated_recipe_draft']);
    }

    public function test_saving_the_draft_creates_a_curated_recipe_tagged_and_in_explore(): void
    {
        $this->chefReplies($this->nasiLemak());

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'Nasi lemak', 'make_icon' => false, 'add_to_explore' => true])
            ->call('generate')->fillForm(['name' => 'Nasi lemak (edited)'])->call('save')->assertHasNoFormErrors()
            ->assertSet('hasDraft', false);

        $recipe = Recipe::sole();
        $this->assertNull($recipe->user_id);
        $this->assertSame('Nasi lemak (edited)', $recipe->name);
        $this->assertSame(35, $recipe->minutes);
        $this->assertSame('dinner', $recipe->meal_type);
        $this->assertSame(['quick_easy'], $recipe->vibes);
        $this->assertSame(['Cook the rice in coconut milk.', 'Fry the eggs.'], $recipe->steps);
        $this->assertSame('Rice', $recipe->ingredients[0]['name']);
        $this->assertNull($recipe->icon_url);
        $this->assertDatabaseHas('explore_items', ['type' => 'recipe', 'ref_id' => $recipe->id]);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'created', 'subject_type' => 'Recipe', 'subject_id' => $recipe->id]);
    }

    public function test_the_recipe_can_get_a_generated_icon_and_stay_out_of_explore(): void
    {
        $this->chefReplies($this->nasiLemak());
        $this->fakeIcons();

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'Nasi lemak', 'make_icon' => true, 'add_to_explore' => false])
            ->call('generate')->call('save');

        $recipe = Recipe::sole();
        $this->assertNotNull($recipe->icon_url);
        $this->assertSame(1, GeneratedIcon::where('kind', 'recipe')->where('user_id', $this->admin->id)->count());
        $this->assertSame(0, ExploreItem::count());
    }

    public function test_a_failed_icon_still_saves_the_recipe(): void
    {
        $this->chefReplies($this->nasiLemak());
        $this->mock(FalClient::class, function ($m) {
            $m->shouldReceive('available')->andReturn(true);
            $m->shouldReceive('generate')->andReturn(['ok' => false, 'reason' => 'server_error']);
        });

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'Nasi lemak', 'make_icon' => true])->call('generate')->call('save');

        $this->assertSame(1, Recipe::count());
        $this->assertNull(Recipe::sole()->icon_url);
    }

    public function test_an_empty_request_or_a_non_food_request_makes_no_draft(): void
    {
        $this->chefReplies(['found' => false]);

        Livewire::test(RecipeStudio::class)->call('generate')->assertSet('hasDraft', false);
        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'fix my car'])->call('generate')->assertSet('hasDraft', false);
        $this->assertSame(0, Recipe::count());
    }

    public function test_a_draft_with_a_blank_name_cannot_be_saved(): void
    {
        $this->chefReplies($this->nasiLemak());

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'x'])->call('generate')
            ->fillForm(['name' => ''])->call('save')->assertHasFormErrors(['name' => 'required']);
        $this->assertSame(0, Recipe::count());
    }

    public function test_discarding_clears_the_draft_but_keeps_the_request(): void
    {
        $this->chefReplies($this->nasiLemak());

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'Nasi lemak'])->call('generate')->call('discard')
            ->assertSet('hasDraft', false)->assertFormSet(['prompt' => 'Nasi lemak']);
    }

    // ---- icon studio -------------------------------------------------------------------------------

    public function test_generating_an_icon_lists_it_until_it_is_added_or_discarded(): void
    {
        $this->fakeIcons();

        $page = Livewire::test(IconStudio::class)->fillForm(['prompt' => 'ripe tomato'])->call('generate');

        $icon = GeneratedIcon::sole();
        $this->assertSame($this->admin->id, $icon->user_id);
        $this->assertSame('icon', $icon->kind);
        $page->assertSee('ripe tomato');
    }

    public function test_adding_a_generated_icon_puts_it_in_the_shared_pack_with_the_chosen_label(): void
    {
        $this->fakeIcons();

        $page = Livewire::test(IconStudio::class)->fillForm(['prompt' => 'ripe tomato'])->call('generate');
        $page->call('addToPack', GeneratedIcon::sole()->id, 'Tomato');

        $shared = SharedIcon::sole();
        $this->assertSame('Tomato', $shared->label);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'promoted_icon', 'subject_id' => $shared->id]);
        $this->assertCount(0, $page->instance()->recent()); // gone from "recent" once in the pack
    }

    public function test_discarding_an_icon_deletes_the_row_and_its_file(): void
    {
        $this->fakeIcons();

        $page = Livewire::test(IconStudio::class)->fillForm(['prompt' => 'ripe tomato'])->call('generate');
        $icon = GeneratedIcon::sole();
        Storage::disk('public')->assertExists($icon->image_path);

        $page->call('discard', $icon->id);

        $this->assertSame(0, GeneratedIcon::count());
        Storage::disk('public')->assertMissing($icon->image_path);
    }

    public function test_the_studio_only_touches_icons_this_admin_generated(): void
    {
        $this->fakeIcons();
        $other = GeneratedIcon::create(['user_id' => User::factory()->create()->id, 'kind' => 'icon', 'credits' => 1, 'prompt' => 'someone elses', 'image_path' => 'icons/x.png', 'image_url' => 'https://cdn.test/x.png']);

        $page = Livewire::test(IconStudio::class);
        $page->call('addToPack', $other->id, 'Stolen')->call('discard', $other->id);

        $this->assertSame(0, SharedIcon::count());
        $this->assertSame(1, GeneratedIcon::count());
    }

    public function test_a_failed_icon_generation_tells_the_operator_and_stores_nothing(): void
    {
        $this->mock(FalClient::class, function ($m) {
            $m->shouldReceive('available')->andReturn(true);
            $m->shouldReceive('generate')->andReturn(['ok' => false, 'reason' => 'rate_limited']);
        });

        Livewire::test(IconStudio::class)->fillForm(['prompt' => 'tomato'])->call('generate');

        $this->assertSame(0, GeneratedIcon::count());
    }

    public function test_the_icon_prompt_is_required(): void
    {
        Livewire::test(IconStudio::class)->fillForm(['prompt' => ''])->call('generate')->assertHasFormErrors(['prompt' => 'required']);
    }

    // ---- cost attribution --------------------------------------------------------------------------

    public function test_ai_calls_made_from_a_studio_are_labelled_as_admin_studio_spend(): void
    {
        config(['services.openrouter.key' => 'k']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => json_encode($this->nasiLemak())]]], 'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 20, 'cost' => 0.002]], 200)]);
        $this->mock(AgentService::class, fn ($m) => $m->shouldReceive('tagRecipe')->andReturn([]));

        Livewire::test(RecipeStudio::class)->fillForm(['prompt' => 'Nasi lemak'])->call('generate');

        $this->assertSame('Admin studio: Ask Chef (recipe)', ApiUsageLog::where('provider', 'openrouter')->sole()->feature);
    }

    public function test_calls_outside_the_studios_keep_their_normal_label(): void
    {
        $this->assertStringStartsNotWith('Admin studio', ApiUsageFeature::resolve());
    }
}
