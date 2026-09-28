<?php

namespace Tests\Feature;

use App\Filament\Resources\RecipeResource\Pages\EditRecipe;
use App\Filament\Resources\RecipeResource\Pages\ListRecipes;
use App\Jobs\GenerateRecipeIcon;
use App\Models\Recipe;
use App\Models\User;
use App\Services\IconGenerationService;
use App\Support\RecipeIconGeneration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class RecipeIconGenerationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.admin_emails' => ['admin@example.com'], 'services.fal.key' => 'test-key']);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
    }

    private function recipe(array $over = []): Recipe
    {
        return Recipe::create(array_merge(['user_id' => null, 'name' => 'Nasi lemak', 'minutes' => 30, 'category' => 'breakfast',
            'ingredients' => [['name' => 'Rice', 'icon' => 'generic']], 'steps' => ['a', 'b']], $over));
    }

    public function test_missing_means_curated_with_no_ai_icon_and_no_pack_icon(): void
    {
        $bare = $this->recipe();
        $this->recipe(['name' => 'Has AI', 'icon_url' => 'https://cdn.test/a.png']);
        $this->recipe(['name' => 'Has pack', 'icon' => 'milk']);
        $this->recipe(['name' => 'Users own', 'user_id' => User::factory()->create()->id]);

        $this->assertSame([$bare->id], RecipeIconGeneration::missing()->pluck('id')->all());
    }

    public function test_generate_missing_icons_queues_one_job_per_recipe_up_to_the_limit(): void
    {
        Queue::fake();
        $a = $this->recipe(['name' => 'A']);
        $b = $this->recipe(['name' => 'B']);
        $this->recipe(['name' => 'C']);

        Livewire::actingAs($this->admin)->test(ListRecipes::class)
            ->callAction('generateMissingIcons', data: ['limit' => 2]);

        Queue::assertPushed(GenerateRecipeIcon::class, 2);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'queued_recipe_icons']);
    }

    public function test_the_edit_page_generates_and_removes_an_ai_icon(): void
    {
        Queue::fake();
        $r = $this->recipe(['icon_url' => 'https://cdn.test/old.png']);

        Livewire::actingAs($this->admin)->test(EditRecipe::class, ['record' => $r->id])
            ->callAction('generateIcon');
        Queue::assertPushed(GenerateRecipeIcon::class, fn ($job) => $job->recipeId === $r->id && $job->replace);

        Livewire::actingAs($this->admin)->test(EditRecipe::class, ['record' => $r->id])
            ->callAction('removeAiIcon');
        $this->assertNull($r->fresh()->icon_url);
    }

    public function test_the_job_draws_the_icon_and_skips_one_that_already_has_it(): void
    {
        $this->mock(IconGenerationService::class, fn ($m) => $m->shouldReceive('generateIcon')->once()->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/new.png']));
        $bare = $this->recipe();
        $done = $this->recipe(['name' => 'Done', 'icon_url' => 'https://cdn.test/keep.png']);

        (new GenerateRecipeIcon($bare->id, $this->admin->id))->handle(app(IconGenerationService::class));
        (new GenerateRecipeIcon($done->id, $this->admin->id))->handle(app(IconGenerationService::class)); // not replaced

        $this->assertSame('https://cdn.test/new.png', $bare->fresh()->icon_url);
        $this->assertSame('https://cdn.test/keep.png', $done->fresh()->icon_url);
    }

    public function test_the_queued_job_saves_into_the_folder_the_worker_can_write(): void
    {
        $r = $this->recipe();
        $this->mock(IconGenerationService::class, fn ($m) => $m->shouldReceive('generateIcon')
            ->once()->with('Nasi lemak', $this->admin->id, 'recipe', GenerateRecipeIcon::QUEUED_FOLDER)
            ->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/new.png']));

        (new GenerateRecipeIcon($r->id, $this->admin->id))->handle(app(IconGenerationService::class));

        $this->assertSame('https://cdn.test/new.png', $r->fresh()->icon_url);
    }

    public function test_the_cleanup_clears_links_to_icons_that_were_never_saved(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('icons/kept.png', 'x');
        $url = fn ($p) => Storage::disk('public')->url($p);
        $missing = $this->recipe(['name' => 'Apple pie', 'icon_url' => $url('icons/gone.png')]);
        $kept = $this->recipe(['name' => 'Laksa', 'icon_url' => $url('icons/kept.png')]);
        $elsewhere = $this->recipe(['name' => 'Roti', 'icon_url' => 'https://cdn.test/a.png']);

        (require database_path('migrations/2026_09_29_000010_clear_missing_recipe_icons.php'))->up();

        $this->assertNull($missing->fresh()->icon_url);
        $this->assertSame($url('icons/kept.png'), $kept->fresh()->icon_url);
        $this->assertSame('https://cdn.test/a.png', $elsewhere->fresh()->icon_url);
    }
}
