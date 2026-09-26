<?php

namespace Tests\Feature;

use App\Models\AlgoFeedbackEvent;
use App\Models\Fridge;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use App\Services\AgentToolbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Quick Chat's meal-plan tools: plan_meals, list_plan, remove_meal. */
class AgentToolboxMealPlanTest extends TestCase
{
    use RefreshDatabase;

    private AgentToolbox $toolbox;

    private User $user;

    private Fridge $fridge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->toolbox = app(AgentToolbox::class);
        $this->user = User::factory()->create(['preferences' => ['meal_slots' => ['Breakfast', 'Dinner']]]);
        $this->fridge = Fridge::create(['user_id' => $this->user->id, 'name' => 'Home']);
        Section::create(['fridge_id' => $this->fridge->id, 'name' => 'Fridge']);
    }

    private function tool(string $tool, array $args, ?User $as = null, string $surface = 'chat'): array
    {
        return $this->toolbox->run($tool, $args, $as ?? $this->user, $this->fridge->id, $surface);
    }

    private function day(int $offset = 1): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function recipe(string $name = 'Pad Thai', ?int $kcal = 640): Recipe
    {
        $recipe = $this->user->recipes()->create([
            'name' => $name, 'minutes' => 20, 'ingredients' => [['name' => 'Rice', 'icon' => 'rice']], 'steps' => ['Cook'],
            'vibes' => [], 'food_focus' => [], 'made_count' => 0,
        ]);
        $recipe->forceFill(['calories' => $kcal, 'calories_source' => 'algorithm'])->saveQuietly();

        return $recipe;
    }

    // ---- availability -------------------------------------------------------------------------

    public function test_the_tools_are_offered_in_chat_but_never_to_an_unattended_machine(): void
    {
        $chat = collect($this->toolbox->schemas('chat'))->pluck('function.name');
        $machine = collect($this->toolbox->schemas('machine'))->pluck('function.name');

        foreach (['plan_meals', 'list_plan', 'remove_meal'] as $tool) {
            $this->assertTrue($chat->contains($tool), $tool);
            $this->assertFalse($machine->contains($tool), $tool);
            $refused = $this->tool($tool, ['meals' => [['date' => $this->day(), 'title' => 'x']]], null, 'machine');
            $this->assertFalse($refused['ok']);
            $this->assertFalse($refused['mutated']);
        }
        $this->assertSame(0, MealEntry::count());
    }

    // ---- plan_meals ---------------------------------------------------------------------------

    public function test_plan_meals_puts_a_week_on_the_calendar_in_one_call_with_calories(): void
    {
        $recipe = $this->recipe();
        $meals = [
            ['date' => $this->day(1), 'title' => 'Chicken rice', 'slot' => 'Dinner'],
            ['date' => $this->day(2), 'recipe_id' => $recipe->id],
            ['date' => $this->day(3), 'title' => 'Banana', 'slot' => 'Breakfast', 'time' => '08:00', 'note' => 'ripe'],
        ];

        $res = $this->tool('plan_meals', ['meals' => $meals]);

        $this->assertTrue($res['ok']);
        $this->assertTrue($res['mutated']);
        $this->assertSame(3, MealEntry::count());
        $this->assertStringContainsString('Planned 3 meals', $res['content']);
        $this->assertStringContainsString('≈640 kcal', $res['content']); // the recipe's own number

        $chicken = MealEntry::where('title', 'Chicken rice')->first();
        $this->assertSame($this->user->id, $chicken->user_id);
        $this->assertSame($this->fridge->id, $chicken->fridge_id); // on the fridge plan, like the app's default
        $this->assertEqualsWithDelta(474, $chicken->calories, 6);
        $this->assertSame('estimate', $chicken->calories_source);

        $pad = MealEntry::where('recipe_id', $recipe->id)->first();
        $this->assertSame('Pad Thai', $pad->title);
        $this->assertSame('Breakfast', MealEntry::where('title', 'Banana')->first()->slot);
        $this->assertSame('08:00', MealEntry::where('title', 'Banana')->first()->time);
    }

    public function test_the_slot_defaults_to_the_users_first_label_then_dinner(): void
    {
        $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'title' => 'Toast']]]);
        $this->assertSame('Breakfast', MealEntry::first()->slot);

        $this->user->forceFill(['preferences' => []])->save();
        $this->tool('plan_meals', ['meals' => [['date' => $this->day(2), 'title' => 'Soup']]]);
        $this->assertSame('Dinner', MealEntry::where('title', 'Soup')->first()->slot);
    }

    public function test_bad_meals_are_skipped_with_a_reason_and_good_ones_still_saved(): void
    {
        $res = $this->tool('plan_meals', ['meals' => [
            ['date' => 'next friday', 'title' => 'x'],                        // not YYYY-MM-DD
            ['date' => '2026-02-30', 'title' => 'x'],                         // not a real date
            ['date' => now()->subDays(40)->toDateString(), 'title' => 'x'],   // far in the past
            ['date' => now()->addDays(900)->toDateString(), 'title' => 'x'],  // absurdly far
            ['date' => $this->day()],                                         // no title or recipe
            ['date' => $this->day(), 'recipe_id' => 999999],                  // unknown recipe
            ['date' => $this->day(4), 'title' => 'Good dinner'],
        ]]);

        $this->assertTrue($res['ok']);
        $this->assertSame(1, MealEntry::count());
        $this->assertSame('Good dinner', MealEntry::first()->title);
        $this->assertStringContainsString('Skipped:', $res['content']);
        $this->assertStringContainsString('YYYY-MM-DD', $res['content']);
        $this->assertStringContainsString('recipe_id', $res['content']);
    }

    public function test_nothing_valid_reports_an_error_and_changes_nothing(): void
    {
        $res = $this->tool('plan_meals', ['meals' => [['date' => 'soon', 'title' => 'x']]]);
        $this->assertFalse($res['mutated']);
        $this->assertStringStartsWith('Nothing was planned', $res['content']);

        $this->assertStringStartsWith('Error', $this->tool('plan_meals', ['meals' => []])['content']);
        $this->assertStringStartsWith('Error', $this->tool('plan_meals', [])['content']);
        $this->assertSame(0, MealEntry::count());
    }

    public function test_planning_the_same_meal_twice_does_not_duplicate_it(): void
    {
        $meal = ['date' => $this->day(), 'title' => 'Tacos', 'slot' => 'Dinner'];
        $this->tool('plan_meals', ['meals' => [$meal]]);

        $again = $this->tool('plan_meals', ['meals' => [array_merge($meal, ['title' => 'TACOS', 'slot' => 'dinner'])]]);

        $this->assertSame(1, MealEntry::count());
        $this->assertFalse($again['mutated']);
        $this->assertStringContainsString('already planned', $again['content']);
    }

    public function test_at_most_21_meals_per_call_and_long_text_is_trimmed(): void
    {
        $meals = array_map(fn ($i) => ['date' => $this->day(1 + ($i % 20)), 'title' => "Meal {$i}", 'slot' => 'S'.$i], range(1, 30));
        $this->tool('plan_meals', ['meals' => $meals]);
        $this->assertSame(21, MealEntry::count());

        $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'title' => str_repeat('t', 300), 'slot' => str_repeat('s', 90), 'note' => str_repeat('n', 400)]]]);
        $long = MealEntry::where('slot', str_repeat('s', 40))->first();
        $this->assertSame(120, mb_strlen($long->title));
        $this->assertSame(255, mb_strlen($long->note));
    }

    public function test_a_recipe_the_user_cannot_use_is_refused(): void
    {
        $someone = User::factory()->create();
        $theirs = $someone->recipes()->create([
            'name' => 'Secret', 'minutes' => 5, 'ingredients' => [['name' => 'Egg', 'icon' => 'eggs']], 'steps' => ['x'],
            'vibes' => [], 'food_focus' => [], 'made_count' => 0,
        ]);

        $res = $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'recipe_id' => $theirs->id]]]);

        $this->assertSame(0, MealEntry::count());
        $this->assertStringContainsString('no recipe with that id', $res['content']);
    }

    public function test_planning_records_structured_feedback_only(): void
    {
        config(['app.algo_feedback_enabled' => true]);

        $this->tool('plan_meals', ['meals' => [['date' => $this->day(2), 'title' => 'Secret dinner', 'note' => 'private']]]);

        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'meal_plan', 'kind' => 'planned', 'source' => 'free_text', 'guess_number' => 2]);
        $this->assertSame(0, AlgoFeedbackEvent::where('guess', 'like', '%ecret%')->count());
    }

    // ---- list_plan ----------------------------------------------------------------------------

    public function test_list_plan_shows_meals_by_day_with_totals_and_the_users_labels(): void
    {
        $this->tool('plan_meals', ['meals' => [
            ['date' => $this->day(1), 'title' => 'Banana', 'slot' => 'Breakfast'],
            ['date' => $this->day(1), 'title' => 'Chicken rice', 'slot' => 'Dinner', 'time' => '19:00'],
            ['date' => $this->day(1), 'title' => 'Zorblax surprise', 'slot' => 'Dinner'],
            ['date' => $this->day(20), 'title' => 'Far away'],
        ]]);

        $res = $this->tool('list_plan', []);

        $this->assertTrue($res['ok']);
        $this->assertStringContainsString('Banana', $res['content']);
        $this->assertStringContainsString('Chicken rice', $res['content']);
        $this->assertStringContainsString('Day total ≈', $res['content']);
        $this->assertStringContainsString('some meals have no estimate', $res['content']); // the unknown one
        $this->assertStringContainsString('meal labels: Breakfast, Dinner', $res['content']);
        $this->assertStringNotContainsString('Far away', $res['content']); // default window is 14 days
        $this->assertStringContainsString('#'.MealEntry::where('title', 'Banana')->first()->id, $res['content']);

        $wide = $this->tool('list_plan', ['from' => $this->day(15), 'to' => $this->day(25)]);
        $this->assertStringContainsString('Far away', $wide['content']);
    }

    public function test_list_plan_says_when_nothing_is_planned_and_validates_the_range(): void
    {
        $this->assertStringContainsString('Nothing is planned', $this->tool('list_plan', [])['content']);
        $this->assertStringStartsWith('Error', $this->tool('list_plan', ['from' => $this->day(5), 'to' => $this->day(1)])['content']);
        $this->assertStringStartsWith('Error', $this->tool('list_plan', ['fridge_id' => 999999])['content']);
    }

    public function test_list_plan_follows_the_sharing_rules(): void
    {
        $member = User::factory()->create();
        $this->fridge->members()->syncWithoutDetaching([$member->id => ['role' => 'member']]);
        $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'title' => 'Owner plan']]]);

        // Owner is not Pro: the member sees nothing of it.
        $this->assertStringNotContainsString('Owner plan', $this->tool('list_plan', [], $member)['content']);

        $this->user->forceFill(['pro_expires_at' => now()->addMonth()])->save();
        $shared = $this->tool('list_plan', [], $member)['content'];
        $this->assertStringContainsString('Owner plan', $shared);
        $this->assertStringContainsString('by @'.$this->user->username, $shared);
    }

    // ---- remove_meal --------------------------------------------------------------------------

    public function test_remove_meal_previews_first_and_only_deletes_when_confirmed(): void
    {
        $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'title' => 'Tacos']]]);
        $entry = MealEntry::first();

        $preview = $this->tool('remove_meal', ['meal_id' => $entry->id]);
        $this->assertStringStartsWith('Not removed yet', $preview['content']);
        $this->assertFalse($preview['mutated']);
        $this->assertSame(1, MealEntry::count());

        $done = $this->tool('remove_meal', ['meal_id' => $entry->id, 'confirm' => true]);
        $this->assertTrue($done['mutated']);
        $this->assertSame(0, MealEntry::count());
        $this->assertStringContainsString('Removed', $done['content']);
    }

    public function test_remove_meal_matches_by_title_and_will_not_guess_between_several(): void
    {
        $this->tool('plan_meals', ['meals' => [
            ['date' => $this->day(1), 'title' => 'Chicken rice'],
            ['date' => $this->day(2), 'title' => 'Chicken soup'],
            ['date' => $this->day(2), 'title' => 'Fish curry', 'slot' => 'Breakfast'],
        ]]);

        $ambiguous = $this->tool('remove_meal', ['text' => 'chicken', 'confirm' => true]);
        $this->assertStringContainsString('matches 2 meals', $ambiguous['content']);
        $this->assertFalse($ambiguous['mutated']);
        $this->assertSame(3, MealEntry::count());

        $narrowed = $this->tool('remove_meal', ['text' => 'chicken', 'date' => $this->day(2), 'confirm' => true]);
        $this->assertTrue($narrowed['mutated']);
        $this->assertNull(MealEntry::where('title', 'Chicken soup')->first());

        $this->assertStringContainsString('No planned meal matches', $this->tool('remove_meal', ['text' => 'pizza'])['content']);
        $this->assertStringStartsWith('Error', $this->tool('remove_meal', [])['content']);
        $this->assertStringStartsWith('Error', $this->tool('remove_meal', ['meal_id' => 999999])['content']);
    }

    public function test_remove_meal_cannot_touch_someone_elses_entry_but_can_on_a_pro_owned_fridge(): void
    {
        $member = User::factory()->create();
        $this->fridge->members()->syncWithoutDetaching([$member->id => ['role' => 'member']]);
        $this->tool('plan_meals', ['meals' => [['date' => $this->day(), 'title' => 'Owner plan']]]);
        $entry = MealEntry::first();

        $blocked = $this->tool('remove_meal', ['meal_id' => $entry->id, 'confirm' => true], $member);
        $this->assertStringStartsWith('Error', $blocked['content']);
        $this->assertSame(1, MealEntry::count());

        $this->user->forceFill(['pro_granted' => true])->save();
        $allowed = $this->tool('remove_meal', ['meal_id' => $entry->id, 'confirm' => true], $member);
        $this->assertTrue($allowed['mutated']);
        $this->assertSame(0, MealEntry::count());
    }
}
