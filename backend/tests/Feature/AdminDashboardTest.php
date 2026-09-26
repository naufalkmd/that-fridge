<?php

namespace Tests\Feature;

use App\Filament\Resources\AdminTodoResource\Pages\CreateAdminTodo;
use App\Filament\Resources\AdminTodoResource\Pages\ListAdminTodos;
use App\Filament\Widgets\AiProviderStats;
use App\Filament\Widgets\AiSpendByFeatureChart;
use App\Filament\Widgets\AiSpendChart;
use App\Filament\Widgets\CreditSpendChart;
use App\Filament\Widgets\LaunchTodos;
use App\Filament\Widgets\OnboardingFunnelWidget;
use App\Filament\Widgets\SignupsChart;
use App\Filament\Widgets\StatsOverview;
use App\Models\AdminTodo;
use App\Models\AiCreditLedger;
use App\Models\ApiUsageLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Livewire\Livewire;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.admin_emails' => ['admin@example.com'], 'services.openrouter.key' => null]);
        $this->actingAs(User::factory()->create(['email' => 'admin@example.com']));
        Cache::flush();
    }

    private function chartData($component): array
    {
        return (fn () => $this->getData())->call($component->instance());
    }

    private function usage(string $provider, string $feature, float $cost, array $over = []): void
    {
        ApiUsageLog::create($over + ['provider' => $provider, 'feature' => $feature, 'cost_usd' => $cost, 'prompt_tokens' => 1000, 'completion_tokens' => 500, 'ok' => true]);
    }

    private function spendCredits(int $n, string $reason = 'chat'): void
    {
        AiCreditLedger::create(['user_id' => User::factory()->create()->id, 'delta' => -$n, 'balance_after' => 0, 'reason' => $reason]);
    }

    public function test_the_dashboard_page_renders_and_registers_every_new_widget(): void
    {
        $this->get('/admin')->assertOk();

        $registered = filament()->getWidgets();
        foreach ([LaunchTodos::class, AiProviderStats::class, AiSpendChart::class, AiSpendByFeatureChart::class] as $widget) {
            $this->assertContains($widget, $registered);
        }
    }

    public function test_the_new_widgets_do_not_poll(): void
    {
        foreach ([AiProviderStats::class, AiSpendChart::class, AiSpendByFeatureChart::class, LaunchTodos::class] as $widget) {
            $this->assertNull((new \ReflectionProperty($widget, 'pollingInterval'))->getValue(), $widget);
        }
    }

    public function test_provider_stats_show_each_providers_cost_calls_and_failures(): void
    {
        $this->usage('openrouter', 'Quick Chat', 1.234);
        $this->usage('openrouter', 'Receipt scan', 0.0, ['ok' => false, 'cost_usd' => null, 'reason' => 'server_error']);
        $this->usage('fal', 'Icon generation', 0.006, ['cost_estimated' => true]);

        Livewire::test(AiProviderStats::class)
            ->assertSee('OpenRouter')->assertSee('$1.23')->assertSee('2 calls')->assertSee('1 failed')
            ->assertSee('fal.ai (estimate)')->assertSee('$0.006')->assertSee('1 image calls');
    }

    public function test_cost_per_credit_says_whether_credits_are_priced_right(): void
    {
        $this->usage('openrouter', 'Quick Chat', 0.10);
        $this->spendCredits(20); // $0.005 a credit: fine
        Livewire::test(AiProviderStats::class)->assertSee('$0.005')->assertSee('You keep the difference');

        Cache::flush();
        $this->usage('openrouter', 'Quick Chat', 0.90); // now $1.00 for 20 credits = $0.05 a credit
        Livewire::test(AiProviderStats::class)->assertSee('$0.050')->assertSee('losing money');
    }

    public function test_with_no_data_the_stats_say_so_instead_of_showing_nonsense(): void
    {
        Livewire::test(AiProviderStats::class)->assertSee('No credits spent yet')->assertSee('Unavailable')->assertSee('0 calls');
    }

    public function test_the_live_openrouter_balance_shows_when_available(): void
    {
        config(['services.openrouter.key' => 'k']);
        Http::fake(['openrouter.ai/api/v1/credits' => Http::response(['data' => ['total_credits' => 20, 'total_usage' => 10]], 200)]);

        Livewire::test(AiProviderStats::class)->assertSee('$10.00 left')->assertSee('live from OpenRouter')->assertDontSee('top up soon');
    }

    public function test_a_low_openrouter_balance_is_flagged(): void
    {
        config(['services.openrouter.key' => 'k']);
        Http::fake(['openrouter.ai/api/v1/credits' => Http::response(['data' => ['total_credits' => 100, 'total_usage' => 95]], 200)]);

        Livewire::test(AiProviderStats::class)->assertSee('$5.00 left')->assertSee('top up soon');
    }

    public function test_the_daily_spend_chart_stacks_providers_and_the_filter_changes_the_range(): void
    {
        $this->usage('openrouter', 'Quick Chat', 0.2);
        $this->usage('fal', 'Icon generation', 0.01);

        $chart = Livewire::test(AiSpendChart::class);
        $data = $this->chartData($chart);
        $this->assertCount(14, $data['labels']);
        $this->assertSame(['OpenRouter', 'fal.ai (estimate)'], array_column($data['datasets'], 'label'));
        $this->assertEqualsWithDelta(0.2, end($data['datasets'][0]['data']), 1e-6);

        $chart->set('filter', '30');
        $this->assertCount(30, $this->chartData($chart)['labels']);
    }

    public function test_the_feature_chart_lists_features_biggest_first(): void
    {
        $this->usage('openrouter', 'Receipt scan', 0.3);
        $this->usage('openrouter', 'Quick Chat', 0.9);
        $this->usage('fal', 'Icon generation', 0.02);

        $data = $this->chartData(Livewire::test(AiSpendByFeatureChart::class));

        $this->assertSame(['Quick Chat', 'Receipt scan', 'Icon generation'], $data['labels']);
    }

    public function test_the_credit_chart_uses_plain_feature_names_not_internal_reasons(): void
    {
        $this->spendCredits(5, 'chat_image');
        $this->spendCredits(3, 'machine_build');
        $this->spendCredits(1, 'some_new_reason');

        $labels = $this->chartData(Livewire::test(CreditSpendChart::class))['labels'];

        $this->assertSame(['Quick Chat (photo)', 'Kitchen Lab draft', 'Some New Reason'], $labels);
    }

    public function test_the_signups_chart_is_stacked_bars_with_whole_number_ticks(): void
    {
        $chart = Livewire::test(SignupsChart::class);

        $this->assertSame('bar', (fn () => $this->getType())->call($chart->instance()));
        $this->assertStringContainsString('stepSize: 1', (string) (fn () => $this->getOptions())->call($chart->instance()));
    }

    public function test_stats_overview_and_the_funnel_still_render(): void
    {
        Livewire::test(StatsOverview::class)->assertSee('Real users')->assertSee('Users and content');
        Livewire::test(OnboardingFunnelWidget::class)->assertOk()->assertSee('Still with us');
    }

    // ---- to-do -----------------------------------------------------------------------------------

    public function test_the_todo_list_arrives_seeded_with_launch_blockers_first(): void
    {
        $this->assertGreaterThan(10, AdminTodo::count());
        $first = AdminTodo::open()->byUrgency()->first();
        $this->assertSame('blocker', $first->priority);
        $this->assertSame(6, AdminTodo::open()->where('priority', 'blocker')->count());
    }

    public function test_the_dashboard_todo_widget_shows_the_most_urgent_open_items_and_a_countdown(): void
    {
        AdminTodo::query()->delete();
        AdminTodo::create(['title' => 'Later thing', 'category' => 'later', 'priority' => 'low']);
        AdminTodo::create(['title' => 'Submit Devpost', 'category' => 'devpost', 'priority' => 'blocker', 'details' => 'Before the deadline']);
        AdminTodo::create(['title' => 'Done thing', 'category' => 'server', 'priority' => 'blocker', 'status' => 'done']);

        $widget = Livewire::test(LaunchTodos::class);

        $widget->assertSee('Submit Devpost')->assertSee('Launch blocker')->assertSee('1 launch blocker open')->assertSee('2 open in total')
            ->assertDontSee('Done thing')->assertSeeInOrder(['Submit Devpost', 'Later thing']);
        $this->assertMatchesRegularExpression('/(days|hours) to the launch deadline|deadline has passed/', $widget->html());
    }

    public function test_ticking_a_todo_off_on_the_dashboard_marks_it_done_and_is_audited(): void
    {
        AdminTodo::query()->delete();
        $todo = AdminTodo::create(['title' => 'Do it', 'category' => 'server', 'priority' => 'high']);

        Livewire::test(LaunchTodos::class)->call('markDone', $todo->id)->assertDontSee('Do it');

        $this->assertSame('done', $todo->fresh()->status);
        $this->assertNotNull($todo->fresh()->done_at);
        $this->assertDatabaseHas('admin_audit_logs', ['subject_type' => 'AdminTodo', 'subject_id' => $todo->id]);
    }

    public function test_the_todo_page_lists_open_items_by_default_and_toggles_them(): void
    {
        AdminTodo::query()->delete();
        $open = AdminTodo::create(['title' => 'Open one', 'category' => 'ios', 'priority' => 'blocker']);
        $done = AdminTodo::create(['title' => 'Done one', 'category' => 'ios', 'priority' => 'low', 'status' => 'done']);

        Livewire::test(ListAdminTodos::class)->assertCanSeeTableRecords([$open])->assertCanNotSeeTableRecords([$done])
            ->callTableAction('toggle', $open);

        $this->assertSame('done', $open->fresh()->status);
        $this->assertNotNull($open->fresh()->done_at);

        Livewire::test(ListAdminTodos::class)->filterTable('status', 'done')->callTableAction('toggle', $done);

        $this->assertSame('open', $done->fresh()->status);
        $this->assertNull($done->fresh()->done_at);
    }

    public function test_a_todo_can_be_added(): void
    {
        Livewire::test(CreateAdminTodo::class)
            ->fillForm(['title' => 'Call the bank', 'category' => 'android', 'priority' => 'high', 'status' => 'open'])
            ->call('create')->assertHasNoFormErrors();

        $this->assertDatabaseHas('admin_todos', ['title' => 'Call the bank', 'priority' => 'high']);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'created', 'subject_type' => 'AdminTodo']);
    }
}
