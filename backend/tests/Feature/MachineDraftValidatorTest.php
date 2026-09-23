<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\User;
use App\Services\MachineDraftValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MachineDraftValidatorTest extends TestCase
{
    use RefreshDatabase;

    private MachineDraftValidator $validator;

    private User $user;

    private Fridge $fridge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = app(MachineDraftValidator::class);
        $this->user = User::factory()->create();
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
    }

    private function validDraft(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Weekly calorie check',
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '08:00', 'weekday' => 1]],
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories', 'expiring_within_days' => 7]],
                ['tool' => 'notify_user', 'args' => ['message' => 'Expiring soon: {step1}']],
            ],
        ], $overrides);
    }

    public function test_accepts_a_valid_schedule_trigger_draft(): void
    {
        $result = $this->validator->validate($this->validDraft(), $this->user);

        $this->assertTrue($result['valid']);
        $this->assertSame([], $result['errors']);
        $this->assertSame('Weekly calorie check', $result['draft']['name']);
        $this->assertSame('schedule', $result['draft']['trigger_type']);
        $this->assertSame(1, $result['draft']['trigger_config']['weekday']);
        $this->assertCount(2, $result['draft']['steps']);
    }

    public function test_rejects_a_missing_name(): void
    {
        $result = $this->validator->validate($this->validDraft(['name' => '']), $this->user);

        $this->assertFalse($result['valid']);
        $this->assertNotEmpty($result['errors']);
    }

    public function test_rejects_an_unknown_trigger_type(): void
    {
        $result = $this->validator->validate($this->validDraft(['trigger' => ['type' => 'moonphase']]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_schedule_trigger_requires_weekday_when_weekly(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '08:00']],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_schedule_trigger_accepts_daily_without_weekday(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '08:00']],
        ]), $this->user);

        $this->assertTrue($result['valid']);
        $this->assertNull($result['draft']['trigger_config']['weekday']);
    }

    public function test_rejects_a_malformed_time(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '8am']],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_item_added_trigger_accepts_an_optional_search_and_location(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'item_added', 'config' => ['search' => 'milk', 'location' => 'fridge']],
        ]), $this->user);

        $this->assertTrue($result['valid']);
        $this->assertSame('milk', $result['draft']['trigger_config']['search']);
    }

    public function test_threshold_trigger_requires_a_unit_when_field_is_weight(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'threshold', 'config' => ['field' => 'weight', 'op' => 'lt', 'value' => 2]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_threshold_trigger_accepts_a_valid_config(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'trigger' => ['type' => 'threshold', 'config' => ['field' => 'weight', 'unit' => 'kg', 'op' => 'lt', 'value' => 2]],
        ]), $this->user);

        $this->assertTrue($result['valid']);
        $this->assertSame('kg', $result['draft']['trigger_config']['unit']);
    }

    public function test_rejects_zero_steps(): void
    {
        $result = $this->validator->validate($this->validDraft(['steps' => []]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_more_than_ten_steps(): void
    {
        $steps = array_fill(0, 11, ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity']]);

        $result = $this->validator->validate($this->validDraft(['steps' => $steps]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_a_tool_that_is_not_machine_eligible(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'remove_item', 'args' => ['item_id' => 1, 'confirm' => true]]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
        $this->assertStringContainsString("isn't a tool a Machine can use", $result['errors'][0]);
    }

    public function test_rejects_a_missing_required_argument(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'notify_user', 'args' => []]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_an_argument_not_in_the_tools_schema(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'notify_user', 'args' => ['message' => 'hi', 'made_up_arg' => 'x']]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_an_invalid_enum_value(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'price']]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_a_wrong_typed_argument(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'list_items', 'args' => ['expired_only' => 'yes']]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_a_placeholder_referencing_a_later_or_same_step(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [
                ['tool' => 'notify_user', 'args' => ['message' => 'Total: {step2}']],
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
            ],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_accepts_a_placeholder_referencing_an_earlier_step(): void
    {
        $result = $this->validator->validate($this->validDraft(), $this->user);

        $this->assertTrue($result['valid']);
    }

    public function test_rejects_a_fridge_id_that_does_not_belong_to_the_user(): void
    {
        $stranger = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Not Mine']);

        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity', 'fridge_id' => $stranger->id]]],
        ]), $this->user);

        $this->assertFalse($result['valid']);
    }

    public function test_accepts_a_fridge_id_the_user_owns(): void
    {
        $result = $this->validator->validate($this->validDraft([
            'steps' => [['tool' => 'sum_item_field', 'args' => ['field' => 'quantity', 'fridge_id' => $this->fridge->id]]],
        ]), $this->user);

        $this->assertTrue($result['valid']);
    }
}
