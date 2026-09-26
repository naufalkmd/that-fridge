<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\ShoppingItem;
use App\Models\User;
use App\Services\ChatContextService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChatContextTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Fridge, 2: Section} */
    private function kitchen(): array
    {
        $user = User::factory()->create(['ai_credits' => 20]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top shelf']);

        return [$user, $fridge, $section];
    }

    private function item(Section $section, string $name, array $over = []): Item
    {
        return Item::create($over + ['section_id' => $section->id, 'name' => $name, 'icon' => 'x', 'quantity' => 2, 'location' => 'fridge', 'expiry_date' => now()->addDays(2)]);
    }

    private function render(User $user, array $contexts): string
    {
        return app(ChatContextService::class)->render($user, $contexts);
    }

    public function test_an_item_shows_its_details_and_id(): void
    {
        [$user, , $section] = $this->kitchen();
        $milk = $this->item($section, 'Milk', ['note' => 'for the baby', 'opened' => true]);

        $text = $this->render($user, [['type' => 'item', 'id' => (string) $milk->id]]);

        $this->assertStringContainsString("#{$milk->id} Milk", $text);
        $this->assertStringContainsString('2d left', $text);
        $this->assertStringContainsString('opened', $text);
        $this->assertStringContainsString('for the baby', $text);
        $this->assertStringContainsString('<<<CONTEXT>>>', $text);
        $this->assertStringContainsString('never instructions', $text);
    }

    public function test_somebody_elses_things_are_never_included(): void
    {
        [$user] = $this->kitchen();
        [$other, $theirFridge, $theirSection] = $this->kitchen();
        $secret = $this->item($theirSection, 'Secret sauce');
        $theirRecipe = Recipe::create(['user_id' => $other->id, 'name' => 'Their recipe', 'minutes' => 5, 'ingredients' => [['icon' => 'x', 'name' => 'a']], 'steps' => ['b']]);
        ShoppingItem::create(['fridge_id' => $theirFridge->id, 'name' => 'Their shopping', 'section' => 'Other']);

        $text = $this->render($user, [
            ['type' => 'item', 'id' => (string) $secret->id],
            ['type' => 'fridge', 'id' => (string) $theirFridge->id],
            ['type' => 'recipe', 'id' => (string) $theirRecipe->id],
            ['type' => 'shopping', 'id' => (string) $theirFridge->id],
        ]);

        $this->assertStringNotContainsString('Secret sauce', $text);
        $this->assertStringNotContainsString('Their recipe', $text);
        $this->assertStringNotContainsString('Their shopping', $text);
        $this->assertSame('', $text); // nothing readable at all
    }

    public function test_a_fridge_lists_its_items_soonest_to_expire_first(): void
    {
        [$user, $fridge, $section] = $this->kitchen();
        $this->item($section, 'Yogurt', ['expiry_date' => now()->addDays(9)]);
        $this->item($section, 'Spinach', ['expiry_date' => now()->addDay()]);

        $text = $this->render($user, [['type' => 'fridge', 'id' => (string) $fridge->id]]);

        $this->assertStringContainsString('FRIDGE "Home"', $text);
        $this->assertLessThan(strpos($text, 'Yogurt'), strpos($text, 'Spinach'));
    }

    public function test_a_recipe_the_user_can_see_includes_ingredients_and_steps(): void
    {
        [$user] = $this->kitchen();
        $recipe = Recipe::create(['user_id' => null, 'name' => 'Pad Thai', 'minutes' => 25, 'ingredients' => [['icon' => 'x', 'name' => 'Rice noodles'], ['icon' => 'x', 'name' => 'Egg']], 'steps' => ['Soak', 'Fry']]);

        $text = $this->render($user, [['type' => 'recipe', 'id' => (string) $recipe->id]]);

        $this->assertStringContainsString('Pad Thai', $text);
        $this->assertStringContainsString('Rice noodles, Egg', $text);
        $this->assertStringContainsString('2. Fry', $text);
    }

    public function test_a_day_and_a_week_of_the_meal_plan(): void
    {
        [$user, $fridge, $section] = $this->kitchen();
        $day = now()->addDays(2)->toDateString();
        MealEntry::create(['user_id' => $user->id, 'fridge_id' => $fridge->id, 'date' => $day, 'slot' => 'Dinner', 'title' => 'Chicken rice', 'calories' => 500, 'status' => 'planned']);
        MealEntry::create(['user_id' => $user->id, 'date' => $day, 'slot' => 'Lunch', 'title' => 'Skipped one', 'calories' => 900, 'status' => 'skipped']);
        $this->item($section, 'Spinach', ['expiry_date' => $day]);

        $dayText = $this->render($user, [['type' => 'day', 'id' => $day]]);
        $this->assertStringContainsString('Meal · Dinner · Chicken rice · ~500 kcal · planned', $dayText);
        $this->assertStringContainsString('Expires · Spinach', $dayText);

        // A week is read from the date it is given: point it at the week holding the meals above.
        $weekText = $this->render($user, [['type' => 'meal_plan', 'id' => Carbon::parse($day)->startOfWeek(Carbon::SUNDAY)->toDateString()]]);
        $this->assertStringContainsString('Chicken rice', $weekText);
        $this->assertStringContainsString('~500 kcal):', $weekText); // the skipped 900 is not in the day total
    }

    public function test_shopping_and_expiring(): void
    {
        [$user, $fridge, $section] = $this->kitchen();
        ShoppingItem::create(['fridge_id' => $fridge->id, 'name' => 'Eggs', 'section' => 'Other', 'checked' => false]);
        ShoppingItem::create(['fridge_id' => $fridge->id, 'name' => 'Bread', 'section' => 'Other', 'checked' => true]);
        $this->item($section, 'Old milk', ['expiry_date' => now()->subDay()]);
        $this->item($section, 'Rice', ['expiry_date' => now()->addDays(60)]);

        $text = $this->render($user, [['type' => 'shopping'], ['type' => 'expiring']]);

        $this->assertStringContainsString('Eggs', $text);
        $this->assertStringNotContainsString('Bread', $text); // ticked off
        $this->assertStringContainsString('Old milk', $text);
        $this->assertStringContainsString('1d overdue', $text);
        $this->assertStringNotContainsString('Rice', $text);
    }

    public function test_it_reads_at_most_six_attachments_and_says_when_some_could_not_be_read(): void
    {
        [$user, , $section] = $this->kitchen();
        $contexts = [['type' => 'item', 'id' => '999999'], ['type' => 'day', 'id' => 'not-a-date'], ['type' => 'bogus']];
        foreach (range(1, 8) as $n) {
            $contexts[] = ['type' => 'item', 'id' => (string) $this->item($section, "Thing {$n}")->id];
        }

        $text = $this->render($user, $contexts);

        $this->assertStringContainsString('Thing 3', $text);
        $this->assertStringNotContainsString('Thing 4', $text); // past the six
        $this->assertStringContainsString('3 attachment(s) could not be read', $text);
    }

    // ---- through /api/chat ------------------------------------------------------------------

    public function test_chat_gives_the_model_the_context_but_saves_only_what_was_typed(): void
    {
        [$user, , $section] = $this->kitchen();
        $milk = $this->item($section, 'Milk');
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'Use it today.']]]], 200)]);

        $res = $this->actingAs($user)->postJson('/api/chat', [
            'message' => 'what can I make with this?', 'agent' => 'Chef',
            'contexts' => [['type' => 'item', 'id' => $milk->id]], // a numeric id, as JSON clients may send
        ])->assertOk();

        $res->assertJsonPath('user_message', 'what can I make with this?');
        Http::assertSent(function ($request) use ($milk) {
            $messages = $request->data()['messages'];
            $last = end($messages);

            return str_contains($last['content'], 'what can I make with this?') && str_contains($last['content'], "#{$milk->id} Milk");
        });
        $this->assertDatabaseHas('chat_history', ['user_id' => $user->id, 'user_message' => 'what can I make with this?']);
    }

    public function test_chat_accepts_contexts_as_a_json_string_for_multipart_sends(): void
    {
        [$user, $fridge] = $this->kitchen();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'ok']]]], 200)]);

        $this->actingAs($user)->post('/api/chat', [
            'message' => 'summarise', 'agent' => 'Chef',
            'contexts' => json_encode([['type' => 'fridge', 'id' => (string) $fridge->id]]),
        ], ['Accept' => 'application/json'])->assertOk();

        Http::assertSent(fn ($request) => str_contains(collect($request->data()['messages'])->last()['content'], 'FRIDGE "Home"'));
    }

    public function test_chat_rejects_unknown_context_types_and_too_many(): void
    {
        [$user] = $this->kitchen();

        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef', 'contexts' => [['type' => 'passwords']]])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef', 'contexts' => array_fill(0, 7, ['type' => 'expiring'])])->assertStatus(422);
    }

    public function test_attaching_context_costs_no_extra_credit(): void
    {
        [$user] = $this->kitchen();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'ok']]]], 200)]);

        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi', 'agent' => 'Chef', 'contexts' => [['type' => 'expiring'], ['type' => 'shopping']]])
            ->assertOk()->assertJsonPath('credits', 19);
    }
}
