<?php

namespace Tests\Feature;

use App\Jobs\RunMachine;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Section;
use App\Models\User;
use App\Services\AgentToolbox;
use App\Services\ChatContextService;
use App\Services\MachineDraftValidator;
use App\Services\MachineTriggerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Custom fields ("Protein" = "25 g") have to be usable everywhere an item is: read by Quick Chat, summed and filtered by the
 * toolbox, and driving Machines - so a value written the way people write it ("25 g") must count as 25.
 */
class CustomFieldIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private AgentToolbox $toolbox;

    private User $user;

    private Fridge $fridge;

    private Section $section;

    protected function setUp(): void
    {
        parent::setUp();
        $this->toolbox = app(AgentToolbox::class);
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
        $this->section = Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function item(string $name, array $fields = [], array $attrs = []): Item
    {
        return Item::create($attrs + [
            'section_id' => $this->section->id, 'name' => $name, 'icon' => 'x', 'quantity' => 1, 'location' => 'fridge',
            'custom_fields' => array_map(fn ($f) => ['id' => (string) Str::uuid()] + $f, $fields),
        ]);
    }

    private function tool(string $tool, array $args): string
    {
        return $this->toolbox->run($tool, $args, $this->user, $this->fridge->id)['content'];
    }

    public function test_a_sum_counts_values_written_with_a_unit_and_multiplies_by_quantity(): void
    {
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g']], ['quantity' => 2]);
        $this->item('Tofu', [['label' => 'protein', 'value' => '40']]);
        $this->item('Bread', [['label' => 'Protein', 'value' => 'lots']]);   // text: skipped
        $this->item('Rice', []);                                             // no field: skipped

        $content = $this->tool('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Protein']);

        $this->assertStringContainsString('Total "Protein": 350', $content); // 155 x 2 + 40
        $this->assertStringContainsString('across 2 items', $content);
        $this->assertStringContainsString('2 skipped', $content);
    }

    public function test_items_can_be_filtered_by_a_custom_field_range(): void
    {
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g']]);
        $this->item('Tofu', [['label' => 'Protein', 'value' => '8 g']]);
        $this->item('Water', []);

        $high = $this->tool('list_items', ['custom_filter_label' => 'protein', 'custom_filter_min' => 20]);
        $this->assertStringContainsString('Chicken', $high);
        $this->assertStringNotContainsString('Tofu', $high);
        $this->assertStringNotContainsString('Water', $high); // no value at all is never "in range"

        $low = $this->tool('list_items', ['custom_filter_label' => 'Protein', 'custom_filter_max' => 20]);
        $this->assertStringContainsString('Tofu', $low);
        $this->assertStringNotContainsString('Chicken', $low);

        // A label with no bound is not a filter: everything is listed.
        $all = $this->tool('list_items', ['custom_filter_label' => 'Protein']);
        $this->assertStringContainsString('Water', $all);
    }

    public function test_a_sum_can_combine_a_field_with_a_range_filter(): void
    {
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g'], ['label' => 'Fat', 'value' => '18 g']]);
        $this->item('Tofu', [['label' => 'Protein', 'value' => '8 g'], ['label' => 'Fat', 'value' => '5 g']]);

        $content = $this->tool('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Fat', 'custom_filter_label' => 'Protein', 'custom_filter_min' => 100]);

        $this->assertStringContainsString('Total "Fat": 18', $content); // only the high-protein item
    }

    public function test_mark_used_accepts_a_custom_range_as_its_filter_but_not_a_bare_label(): void
    {
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g']]);
        $this->item('Tofu', [['label' => 'Protein', 'value' => '8 g']]);

        $refused = $this->tool('mark_items_used_matching', ['custom_filter_label' => 'Protein']);
        $this->assertStringContainsString('at least one filter', $refused);
        $this->assertSame(2, Item::count()); // nothing was touched

        $this->tool('mark_items_used_matching', ['custom_filter_label' => 'Protein', 'custom_filter_max' => 10]);
        $this->assertSame(['Chicken'], Item::pluck('name')->all()); // only the low-protein one was used up
    }

    public function test_a_machine_draft_may_filter_on_a_custom_range_and_the_bare_label_is_still_refused(): void
    {
        $validator = app(MachineDraftValidator::class);
        $draft = fn (array $args) => [
            'name' => 'Use up low protein',
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '08:00']],
            'steps' => [['tool' => 'mark_items_used_matching', 'args' => $args]],
        ];

        $this->assertTrue($validator->validate($draft(['custom_filter_label' => 'Protein', 'custom_filter_max' => 5]), $this->user)['valid']);
        $bare = $validator->validate($draft(['custom_filter_label' => 'Protein']), $this->user);
        $this->assertFalse($bare['valid']);
        $this->assertStringContainsString('custom field range', implode(' ', $bare['errors']));
    }

    public function test_a_threshold_machine_on_a_custom_field_fires_when_the_total_crosses_it(): void
    {
        Queue::fake();
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g']]);
        $machine = Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'Protein low', 'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'custom', 'custom_field_label' => 'Protein', 'unit' => null, 'filter' => [], 'op' => 'lt', 'value' => 200],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'Protein is low: {step1}']]], 'enabled' => true, 'version' => 1,
        ]);

        app(MachineTriggerService::class)->recheckThresholds($this->fridge);

        Queue::assertPushed(RunMachine::class, fn ($job) => $job->machineId === $machine->id); // 155 < 200
        $this->assertTrue($machine->fresh()->threshold_met);
    }

    public function test_editing_a_custom_field_rechecks_thresholds(): void
    {
        Queue::fake();
        $item = $this->item('Chicken', [['label' => 'Protein', 'value' => '']]);
        Machine::create([
            'user_id' => $this->user->id, 'fridge_id' => $this->fridge->id, 'name' => 'Protein high', 'trigger_type' => 'threshold',
            'trigger_config' => ['field' => 'custom', 'custom_field_label' => 'Protein', 'unit' => null, 'filter' => [], 'op' => 'gte', 'value' => 100],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'Enough protein: {step1}']]], 'enabled' => true, 'version' => 1,
        ]);

        $this->actingAs($this->user)->patchJson("/api/items/{$item->id}", ['custom_fields' => [['label' => 'Protein', 'value' => '155 g']]])->assertOk();

        Queue::assertPushed(RunMachine::class); // the Autofill flow's PATCH is enough to trip a Machine
    }

    public function test_quick_chat_context_shows_custom_fields_for_a_fridge_and_what_is_expiring(): void
    {
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g'], ['label' => 'Supplier', 'value' => ''], ['label' => 'Fat', 'value' => '18 g']], ['expiry_date' => now()->addDay()]);

        $text = app(ChatContextService::class)->render($this->user, [['type' => 'fridge', 'id' => (string) $this->fridge->id], ['type' => 'expiring']]);

        $this->assertStringContainsString('Protein=155 g; Fat=18 g', $text);
        $this->assertStringNotContainsString('Supplier', $text); // empty fields are noise
    }

    public function test_add_item_and_bulk_add_can_set_custom_fields_in_the_same_call(): void
    {
        $one = $this->tool('add_item', ['name' => 'Chicken breast', 'weight' => 500, 'weight_unit' => 'g', 'custom_fields' => [['label' => 'Protein', 'value' => '155 g']]]);
        $this->assertStringContainsString('Protein=155 g', $one);
        $this->assertSame([['label' => 'Protein', 'value' => '155 g']], collect(Item::where('name', 'Chicken breast')->first()->custom_fields)->map(fn ($f) => ['label' => $f['label'], 'value' => $f['value']])->all());
        $this->assertNotEmpty(Item::where('name', 'Chicken breast')->first()->custom_fields[0]['id']); // a stable id, like any other row

        $this->tool('bulk_add_items', ['items' => [
            ['name' => 'Tofu', 'custom_fields' => [['label' => 'Protein', 'value' => '8 g']]],
            ['name' => 'Rice'],
        ]]);
        $this->assertSame('8 g', Item::where('name', 'Tofu')->first()->custom_fields[0]['value']);
        $this->assertNull(Item::where('name', 'Rice')->first()->custom_fields);

        // ...and what was set is immediately usable by a sum.
        $this->assertStringContainsString('Total "Protein": 163', $this->tool('sum_item_field', ['field' => 'custom', 'custom_field_label' => 'Protein']));
    }

    public function test_a_bad_custom_field_on_a_new_item_is_refused_rather_than_half_saved(): void
    {
        $content = $this->tool('add_item', ['name' => 'Milk', 'custom_fields' => [['label' => str_repeat('x', 41), 'value' => '1']]]);

        $this->assertStringContainsString('too long', $content);
        $this->assertSame(0, Item::where('name', 'Milk')->count());
    }

    public function test_a_machine_can_add_an_item_with_custom_fields_and_a_threshold_can_carry_a_custom_range_filter(): void
    {
        $validator = app(MachineDraftValidator::class);
        $add = $validator->validate([
            'name' => 'Sunday chicken',
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '09:00', 'weekday' => 0]],
            'steps' => [['tool' => 'add_item', 'args' => ['name' => 'Chicken breast', 'shelf_life_days' => 3, 'custom_fields' => [['label' => 'Protein', 'value' => '155 g']]]]],
        ], $this->user);
        $this->assertTrue($add['valid'], implode(' ', $add['errors']));

        $threshold = $validator->validate([
            'name' => 'High protein stock',
            'trigger' => ['type' => 'threshold', 'config' => [
                'field' => 'quantity', 'op' => 'gte', 'value' => 3,
                'filter' => ['custom_filter_label' => 'Protein', 'custom_filter_min' => 20],
            ]],
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'Plenty of high-protein food in stock']]],
        ], $this->user);
        $this->assertTrue($threshold['valid'], implode(' ', $threshold['errors']));

        // ...and that filter is honoured when the threshold is evaluated.
        $this->item('Chicken', [['label' => 'Protein', 'value' => '155 g']], ['quantity' => 2]);
        $this->item('Tofu', [['label' => 'Protein', 'value' => '8 g']], ['quantity' => 5]);
        $total = $this->toolbox->fieldTotal($this->user, ['field' => 'quantity', 'fridge_id' => $this->fridge->id, 'custom_filter_label' => 'Protein', 'custom_filter_min' => 20]);
        $this->assertSame(2.0, (float) $total); // only the chicken counts
    }
}
