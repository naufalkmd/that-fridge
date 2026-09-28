<?php

namespace Tests\Feature;

use App\Filament\Pages\RecipeImport;
use App\Jobs\ImportRecipes;
use App\Models\User;
use App\Services\RecipeImport\RecipeImportRunner;
use App\Services\RecipeImport\RecipeImportSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Livewire\Livewire;
use Tests\TestCase;

class RecipeImportAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.admin_emails' => ['admin@example.com']]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
    }

    public function test_the_admin_sets_the_schedule(): void
    {
        Livewire::actingAs($this->admin)->test(RecipeImport::class)
            ->set('data.enabled', true)
            ->set('data.time', '06:15')
            ->set('data.limit', 35)
            ->call('save')
            ->assertHasNoErrors();

        $this->assertTrue(RecipeImportSettings::enabled());
        $this->assertSame('06:15', RecipeImportSettings::time());
        $this->assertSame(35, RecipeImportSettings::limit());
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'updated_recipe_import']);
    }

    public function test_a_bad_time_is_rejected(): void
    {
        Livewire::actingAs($this->admin)->test(RecipeImport::class)
            ->set('data.time', '25:99')
            ->call('save')
            ->assertHasErrors(['data.time']);
    }

    public function test_run_now_queues_an_import_with_the_chosen_size(): void
    {
        Queue::fake();

        Livewire::actingAs($this->admin)->test(RecipeImport::class)
            ->callAction('runNow', ['limit' => 12]);

        Queue::assertPushed(ImportRecipes::class, fn ($job) => $job->limit === 12);
    }

    public function test_the_daily_run_is_due_once_at_the_chosen_minute_and_only_when_on(): void
    {
        RecipeImportSettings::save(false, '06:15', 20);
        $this->assertFalse(RecipeImportSettings::dueNow(Carbon::parse('2026-10-01 06:15')));

        RecipeImportSettings::save(true, '06:15', 20);
        $this->assertTrue(RecipeImportSettings::dueNow(Carbon::parse('2026-10-01 06:15')));
        $this->assertFalse(RecipeImportSettings::dueNow(Carbon::parse('2026-10-01 06:16')));

        Carbon::setTestNow('2026-10-01 06:15');
        RecipeImportSettings::recordRun(['imported' => 1, 'exists' => 0, 'duplicate' => 0, 'low_quality' => 0], 'scheduled');
        $this->assertFalse(RecipeImportSettings::dueNow(Carbon::parse('2026-10-01 06:15'))); // already ran today
        $this->assertTrue(RecipeImportSettings::dueNow(Carbon::parse('2026-10-02 06:15')));
        Carbon::setTestNow();
    }

    public function test_the_page_shows_the_last_run_and_drafts_waiting(): void
    {
        Http::fake(fn () => Http::response(['meals' => null], 200));
        (new ImportRecipes(5))->handle(app(RecipeImportRunner::class));

        $this->actingAs($this->admin, 'web')->get('/admin/recipe-import')
            ->assertOk()
            ->assertSee('run by hand')
            ->assertSee('waiting as drafts');
    }
}
