<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Item;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MealAutofillTest extends TestCase
{
    use RefreshDatabase;

    private function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function modelSays(array $meals): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode(['meals' => $meals])]]],
        ], 200)]);
    }

    private function autofill(User $user, array $over = [])
    {
        return $this->actingAs($user)->postJson('/api/meal-entries/autofill', $over + [
            'from' => $this->day(1), 'to' => $this->day(2),
        ]);
    }

    private function userWithSlots(array $slots = ['Dinner'], int $credits = 20): User
    {
        $user = User::factory()->create(['ai_credits' => $credits, 'preferences' => ['meal_slots' => $slots]]);
        Fridge::create(['user_id' => $user->id, 'name' => 'Home']);

        return $user;
    }

    public function test_it_fills_empty_slots_charges_credits_and_reports_the_usage(): void
    {
        $user = $this->userWithSlots();
        $this->modelSays([
            ['date' => $this->day(1), 'slot' => 'Dinner', 'recipe_id' => null, 'title' => 'Chicken rice'],
            ['date' => $this->day(2), 'slot' => 'Dinner', 'recipe_id' => null, 'title' => 'Veggie stir fry'],
        ]);

        $res = $this->autofill($user)->assertOk();

        $res->assertJsonCount(2, 'created')->assertJsonPath('creditsUsed', 3)->assertJsonPath('balance', 17);
        $this->assertSame(2, MealEntry::where('user_id', $user->id)->count());
        $this->assertDatabaseHas('meal_entries', ['title' => 'Chicken rice', 'slot' => 'Dinner', 'status' => 'planned']);
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'delta' => -3, 'reason' => 'meal_autofill']);
        $this->assertSame(17, $user->fresh()->ai_credits);
    }

    public function test_it_only_fills_gaps_and_never_a_slot_it_was_not_offered(): void
    {
        $user = $this->userWithSlots();
        MealEntry::create(['user_id' => $user->id, 'date' => $this->day(1), 'slot' => 'Dinner', 'title' => 'Mine', 'status' => 'planned']);
        $this->modelSays([
            ['date' => $this->day(1), 'slot' => 'Dinner', 'title' => 'Overwrite attempt'], // already taken
            ['date' => $this->day(2), 'slot' => 'dinner', 'title' => 'Soup'],               // offered (slot case-insensitive)
            ['date' => $this->day(2), 'slot' => 'Dinner', 'title' => 'Second try'],         // slot already used this call
            ['date' => $this->day(5), 'slot' => 'Dinner', 'title' => 'Out of range'],
            ['date' => $this->day(2), 'slot' => 'Brunch', 'title' => 'Not a slot'],
        ]);

        $this->autofill($user)->assertOk()->assertJsonCount(1, 'created')->assertJsonPath('created.0.title', 'Soup');

        $this->assertSame(['Mine', 'Soup'], MealEntry::where('user_id', $user->id)->orderBy('date')->pluck('title')->all());
    }

    public function test_a_recipe_from_the_book_is_used_and_an_unknown_recipe_id_falls_back_to_the_title(): void
    {
        $user = $this->userWithSlots();
        $recipe = Recipe::create(['user_id' => $user->id, 'name' => 'Pad Thai', 'minutes' => 20, 'ingredients' => [], 'steps' => []]);
        $this->modelSays([
            ['date' => $this->day(1), 'slot' => 'Dinner', 'recipe_id' => $recipe->id, 'title' => ''],
            ['date' => $this->day(2), 'slot' => 'Dinner', 'recipe_id' => 99999, 'title' => 'Made-up dish'],
        ]);

        $this->autofill($user)->assertOk()->assertJsonCount(2, 'created');

        $this->assertDatabaseHas('meal_entries', ['recipe_id' => $recipe->id, 'title' => 'Pad Thai']);
        $this->assertDatabaseHas('meal_entries', ['recipe_id' => null, 'title' => 'Made-up dish']);
    }

    public function test_the_prompt_carries_the_empty_slots_and_what_is_expiring(): void
    {
        $user = $this->userWithSlots();
        $fridge = $user->fridges()->first();
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Fridge']);
        Item::create(['section_id' => $section->id, 'name' => 'Spinach', 'icon' => 'leaf', 'quantity' => 1, 'location' => 'fridge', 'expiry_date' => now()->addDay()]);
        $this->modelSays([['date' => $this->day(1), 'slot' => 'Dinner', 'title' => 'Spinach omelette']]);

        $this->autofill($user)->assertOk();

        Http::assertSent(function ($request) {
            $prompt = $request['messages'][0]['content'];

            return str_contains($prompt, $this->day(1)) && str_contains($prompt, 'Spinach (expires in 1d)');
        });
    }

    public function test_nothing_is_charged_when_every_slot_is_taken(): void
    {
        $user = $this->userWithSlots();
        foreach ([1, 2] as $d) {
            MealEntry::create(['user_id' => $user->id, 'date' => $this->day($d), 'slot' => 'Dinner', 'title' => 'x', 'status' => 'planned']);
        }
        Http::fake();

        $this->autofill($user)->assertOk()->assertJsonPath('creditsUsed', 0)->assertJsonPath('balance', 20);

        Http::assertNothingSent();
        $this->assertSame(20, $user->fresh()->ai_credits);
    }

    public function test_a_useless_reply_is_refunded_and_plans_nothing(): void
    {
        $user = $this->userWithSlots();
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'sorry, no']]]], 200)]);

        $this->autofill($user)->assertOk()->assertJsonCount(0, 'created')->assertJsonPath('creditsUsed', 0)->assertJsonPath('balance', 20);

        $this->assertSame(0, MealEntry::count());
        $this->assertDatabaseHas('ai_credit_ledger', ['user_id' => $user->id, 'reason' => 'meal_autofill_refund']);
    }

    public function test_without_an_ai_key_nothing_is_charged(): void
    {
        $user = $this->userWithSlots();
        config(['services.openrouter.key' => null]);

        $this->autofill($user)->assertOk()->assertJsonCount(0, 'created')->assertJsonPath('balance', 20);

        $this->assertSame(20, $user->fresh()->ai_credits);
    }

    public function test_without_enough_credits_it_answers_402_and_plans_nothing(): void
    {
        $user = $this->userWithSlots(credits: 2);
        $this->modelSays([['date' => $this->day(1), 'slot' => 'Dinner', 'title' => 'Soup']]);

        $this->autofill($user)->assertStatus(402);

        $this->assertSame(0, MealEntry::count());
    }

    public function test_validation(): void
    {
        $user = $this->userWithSlots();

        $this->autofill($user, ['from' => $this->day(1), 'to' => $this->day(30)])->assertStatus(422);
        $this->autofill($user, ['from' => $this->day(3), 'to' => $this->day(1)])->assertStatus(422);
        $this->autofill($user, ['fridge_id' => Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Theirs'])->id])->assertStatus(404);
    }

    public function test_it_needs_a_signed_in_user(): void
    {
        $this->postJson('/api/meal-entries/autofill', ['from' => $this->day(1), 'to' => $this->day(2)])->assertStatus(401);
    }
}
