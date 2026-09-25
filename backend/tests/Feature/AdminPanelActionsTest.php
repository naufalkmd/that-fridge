<?php

namespace Tests\Feature;

use App\Filament\Resources\BlockResource\Widgets\MostBlockedUsers;
use App\Filament\Resources\FeedbackResource\Pages\ListFeedback;
use App\Filament\Resources\GeneratedIconResource\Pages\ListGeneratedIcons;
use App\Filament\Resources\ProductResource\Pages\EditProduct;
use App\Filament\Resources\RecipeResource\Pages\ListRecipes;
use App\Filament\Resources\SharedIconResource\Pages\ListSharedIcons;
use App\Filament\Resources\UserResource\Pages\ViewUser;
use App\Filament\Widgets\CreditSpendChart;
use App\Filament\Widgets\LatestFeedback;
use App\Filament\Widgets\OnboardingFunnelWidget;
use App\Filament\Widgets\ScheduledJobs;
use App\Filament\Widgets\SignupsChart;
use App\Filament\Widgets\StatsOverview;
use App\Models\AdminAuditLog;
use App\Models\AlgoFeedbackEvent;
use App\Models\AnalyticsEvent;
use App\Models\Feedback;
use App\Models\GeneratedIcon;
use App\Models\Product;
use App\Models\Recipe;
use App\Models\SharedIcon;
use App\Models\User;
use App\Support\JobHeartbeat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class AdminPanelActionsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.admin_emails' => ['admin@example.com']]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
        $this->actingAs($this->admin);
    }

    public function test_adjust_credits_grants_through_the_ledger_and_is_audited(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('adjustCredits', data: ['amount' => 25, 'note' => 'Refund for failed scan'])
            ->assertHasNoActionErrors();

        $this->assertSame(35, $user->fresh()->ai_credits);
        $this->assertDatabaseHas('ai_credit_ledger', [
            'user_id' => $user->id,
            'delta' => 25,
            'balance_after' => 35,
            'reason' => 'admin_adjust:admin@example.com',
        ]);
        $log = AdminAuditLog::where('action', 'adjusted_credits')->sole();
        $this->assertSame(['amount' => 25, 'before' => 10, 'after' => 35, 'note' => 'Refund for failed scan'], $log->changes);
        $this->assertSame('admin@example.com', $log->admin_email);
    }

    public function test_adjust_credits_can_remove_but_not_below_zero(): void
    {
        $user = User::factory()->create(['ai_credits' => 10]);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('adjustCredits', data: ['amount' => -4, 'note' => 'Abuse']);
        $this->assertSame(6, $user->fresh()->ai_credits);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('adjustCredits', data: ['amount' => -50, 'note' => 'Too many']);
        $this->assertSame(6, $user->fresh()->ai_credits);
        $this->assertSame(1, AdminAuditLog::where('action', 'adjusted_credits')->count());
    }

    public function test_sign_out_everywhere_revokes_all_tokens(): void
    {
        $user = User::factory()->create();
        $user->createToken('phone');
        $user->createToken('tablet');

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('signOutEverywhere');

        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(['tokens_revoked' => 2], AdminAuditLog::where('action', 'signed_out_everywhere')->sole()->changes);
    }

    public function test_delete_account_requires_typing_the_email(): void
    {
        $user = User::factory()->create(['email' => 'gone@example.com']);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('deleteAccount', data: ['confirm_email' => 'wrong@example.com'])
            ->assertHasActionErrors(['confirm_email']);
        $this->assertModelExists($user);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->callAction('deleteAccount', data: ['confirm_email' => 'gone@example.com'])
            ->assertHasNoActionErrors();
        $this->assertModelMissing($user);
        $this->assertSame('gone@example.com', AdminAuditLog::where('action', 'deleted_account')->sole()->changes['email']);
    }

    public function test_admin_accounts_cannot_be_deleted_from_the_panel(): void
    {
        Livewire::test(ViewUser::class, ['record' => $this->admin->getRouteKey()])
            ->assertActionHidden('deleteAccount');
    }

    public function test_viewing_a_users_improvement_feedback_is_audited(): void
    {
        $user = User::factory()->create();
        AlgoFeedbackEvent::create([
            'user_id' => $user->id, 'algo' => 'icon', 'kind' => 'corrected',
            'rules_v' => 1, 'class' => 'milk', 'guess' => 'carton', 'final' => 'milk',
            'occurred_at' => now(),
        ]);

        Livewire::test(ViewUser::class, ['record' => $user->getRouteKey()])
            ->mountAction('improvementFeedback')
            ->assertSee('carton');

        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'viewed_user_improvement_feedback',
            'subject_id' => $user->id,
        ]);
    }

    public function test_feedback_can_be_resolved_and_reopened(): void
    {
        $feedback = Feedback::create(['email' => 'a@b.c', 'message' => 'Bug']);
        $this->assertSame('new', $feedback->fresh()->status);

        Livewire::test(ListFeedback::class)->callTableAction('toggleStatus', $feedback);
        $this->assertSame('resolved', $feedback->fresh()->status);

        Livewire::test(ListFeedback::class)
            ->filterTable('status', 'resolved')
            ->callTableAction('toggleStatus', $feedback);
        $this->assertSame('new', $feedback->fresh()->status);
        $this->assertSame(2, AdminAuditLog::where('action', 'updated')->where('subject_type', 'Feedback')->count());
    }

    public function test_editing_a_product_logs_only_the_changed_fields(): void
    {
        $product = Product::create(['name' => 'Milk', 'barcode' => '123', 'location' => 'fridge']);

        Livewire::test(EditProduct::class, ['record' => $product->getRouteKey()])
            ->fillForm(['name' => 'Whole milk'])
            ->call('save')
            ->assertHasNoFormErrors();

        $log = AdminAuditLog::where('action', 'updated')->sole();
        $this->assertSame(['name' => 'Milk'], $log->changes['before']);
        $this->assertSame(['name' => 'Whole milk'], $log->changes['after']);
    }

    public function test_generated_icon_can_be_promoted_and_then_removed(): void
    {
        Storage::fake(config('filesystems.media_disk'));
        Storage::disk(config('filesystems.media_disk'))->put('icons/a.png', 'png-bytes');
        $generated = GeneratedIcon::create([
            'user_id' => User::factory()->create()->id, 'kind' => 'icon', 'credits' => 1,
            'prompt' => 'tomato', 'image_path' => 'icons/a.png', 'image_url' => 'http://x/icons/a.png',
        ]);

        Livewire::test(ListGeneratedIcons::class)
            ->callTableAction('promote', $generated, data: ['label' => 'Tomato'])
            ->assertHasNoTableActionErrors();

        $shared = SharedIcon::sole();
        $this->assertSame('Tomato', $shared->label);
        Storage::disk(config('filesystems.media_disk'))->assertExists($shared->image_path);

        Livewire::test(ListSharedIcons::class)->callTableAction('remove', $shared);

        $this->assertModelMissing($shared);
        Storage::disk(config('filesystems.media_disk'))->assertMissing($shared->image_path);
        $this->assertSame(['promoted_icon', 'demoted_icon'], AdminAuditLog::orderBy('id')->pluck('action')->all());
    }

    public function test_user_recipe_can_be_copied_to_curated(): void
    {
        $owner = User::factory()->create();
        $recipe = Recipe::create([
            'user_id' => $owner->id, 'name' => 'Nasi lemak', 'minutes' => 30, 'made_count' => 4,
            'ingredients' => [['icon' => 'rice', 'name' => 'Rice']], 'steps' => ['Cook.'],
            'icon_url' => 'http://x/icons/mine.png',
        ]);

        Livewire::test(ListRecipes::class)->callTableAction('copyToCurated', $recipe);

        $copy = Recipe::whereNull('user_id')->sole();
        $this->assertSame('Nasi lemak', $copy->name);
        $this->assertSame(0, $copy->made_count);
        $this->assertNull($copy->icon_url);
        $this->assertSame($owner->id, $recipe->fresh()->user_id);
    }

    public function test_dashboard_and_list_page_widgets_render_with_data(): void
    {
        $user = User::factory()->create(['oauth_provider' => 'google']);
        $user->aiCreditLedger()->create(['delta' => -3, 'balance_after' => 47, 'reason' => 'chat']);
        AnalyticsEvent::create(['name' => 'app_open', 'anon_id' => 'x1']);
        Feedback::create(['email' => 'a@b.c', 'message' => 'Hello there']);
        $user->blockedBy()->attach($this->admin->id);
        JobHeartbeat::record('app:prune-stale-data', false);

        Livewire::test(StatsOverview::class)->assertSee('Real users')->assertSee('AI credits spent (7d)');
        Livewire::test(SignupsChart::class)->assertOk();
        Livewire::test(CreditSpendChart::class)->assertOk();
        Livewire::test(OnboardingFunnelWidget::class)->assertSee('App opened');
        Livewire::test(LatestFeedback::class)->assertSee('Hello there');
        Livewire::test(ScheduledJobs::class)->assertSee('Prune stale data')->assertSee('failed');
        Livewire::test(MostBlockedUsers::class)->assertSee($user->email);
    }

    public function test_run_now_buttons_record_a_heartbeat_but_the_dry_run_does_not(): void
    {
        Livewire::test(ScheduledJobs::class)->callAction('pruneDryRun');
        $this->assertNull(JobHeartbeat::last('app:prune-stale-data'));
        $this->assertSame(0, AdminAuditLog::count());

        Livewire::test(ScheduledJobs::class)->callAction('freshness');
        $this->assertTrue(JobHeartbeat::last('app:check-item-freshness')['ok']);
        $this->assertSame('app:check-item-freshness', AdminAuditLog::sole()->changes['command']);
    }
}
