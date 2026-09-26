<?php

namespace Tests\Feature;

use App\Models\AlgoFeedbackEvent;
use App\Models\Fridge;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MealEntryTest extends TestCase
{
    use RefreshDatabase;

    private function proOwner(): User
    {
        $owner = User::factory()->create(['pro_expires_at' => now()->addMonth()]);

        return $owner;
    }

    /** @return array{0: User, 1: User, 2: Fridge} owner, member, the owner's fridge */
    private function sharedFridge(bool $ownerPro = true): array
    {
        $owner = $ownerPro ? $this->proOwner() : User::factory()->create();
        $member = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $owner->id, 'name' => 'Home']);
        $fridge->members()->syncWithoutDetaching([$member->id => ['role' => 'member']]);

        return [$owner, $member, $fridge];
    }

    private function entry(User $author, array $over = []): MealEntry
    {
        return MealEntry::create(array_merge([
            'user_id' => $author->id, 'date' => now()->addDay()->toDateString(), 'slot' => 'Dinner',
            'title' => 'Tacos', 'status' => 'planned',
        ], $over));
    }

    private function calendarTitles(User $viewer, array $query = []): array
    {
        $query += ['from' => now()->toDateString(), 'to' => now()->addDays(10)->toDateString()];

        return collect($this->actingAs($viewer)->getJson('/api/calendar?'.http_build_query($query))->assertOk()->json('entries'))
            ->where('kind', 'meal')->pluck('title')->values()->all();
    }

    private function recipe(User $owner, string $name = 'Pad Thai'): Recipe
    {
        return Recipe::create([
            'user_id' => $owner->id, 'name' => $name, 'minutes' => 20, 'ingredients' => [['name' => 'Rice', 'icon' => 'rice']],
            'steps' => ['Cook'], 'meal_type' => 'dinner', 'vibes' => [], 'food_focus' => [], 'made_count' => 0,
        ]);
    }

    // ---- create / update / delete ---------------------------------------------------------

    public function test_create_a_personal_free_text_entry_and_a_recipe_entry_that_copies_the_name(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);

        $free = $this->actingAs($user)->postJson('/api/meal-entries', [
            'date' => '2026-10-02', 'slot' => '  Dinner ', 'title' => 'Leftovers', 'time' => '18:30', 'note' => 'use the rice',
        ])->assertCreated()->json('data');
        $this->assertSame('Dinner', $free['slot']); // trimmed
        $this->assertSame('planned', $free['status']);
        $this->assertNull($free['fridgeId']);
        $this->assertNull($free['by']);
        $this->assertTrue($free['isMine']);

        $fromRecipe = $this->postJson('/api/meal-entries', ['date' => '2026-10-03', 'slot' => 'Lunch', 'recipe_id' => $recipe->id])
            ->assertCreated()->json('data');
        $this->assertSame('Pad Thai', $fromRecipe['title']);
        $this->assertSame((string) $recipe->id, $fromRecipe['recipeId']);
    }

    public function test_validation(): void
    {
        $user = User::factory()->create();
        $ok = ['date' => '2026-10-02', 'slot' => 'Dinner', 'title' => 'X'];
        $this->actingAs($user);

        $this->postJson('/api/meal-entries', ['date' => '2026-10-02', 'slot' => 'Dinner'])->assertStatus(422)->assertJsonValidationErrors('title'); // neither title nor recipe
        $this->postJson('/api/meal-entries', array_merge($ok, ['date' => 'tomorrow']))->assertStatus(422);
        $this->postJson('/api/meal-entries', array_merge($ok, ['slot' => str_repeat('x', 41)]))->assertStatus(422);
        $this->postJson('/api/meal-entries', array_merge($ok, ['time' => '6pm']))->assertStatus(422);
        $this->postJson('/api/meal-entries', array_merge($ok, ['status' => 'eaten']))->assertStatus(422);
        $this->postJson('/api/meal-entries', array_merge($ok, ['recipe_id' => 99999]))->assertStatus(422);
        $this->postJson('/api/meal-entries', array_merge($ok, ['title' => str_repeat('t', 121)]))->assertStatus(422);
    }

    public function test_cooked_status_stamps_cooked_at_and_going_back_clears_it(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user);

        $cooked = $this->actingAs($user)->patchJson("/api/meal-entries/{$entry->id}", ['status' => 'cooked'])->assertOk()->json('data');
        $this->assertNotNull($cooked['cookedAt']);

        $back = $this->patchJson("/api/meal-entries/{$entry->id}", ['status' => 'skipped'])->assertOk()->json('data');
        $this->assertNull($back['cookedAt']);
        $this->assertSame('skipped', $back['status']);
    }

    public function test_update_edits_fields_and_can_clear_the_time_and_note(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user, ['time' => '18:00', 'note' => 'hi']);

        $res = $this->actingAs($user)->patchJson("/api/meal-entries/{$entry->id}", [
            'title' => 'Curry', 'slot' => 'Lunch', 'time' => null, 'note' => null, 'date' => '2026-11-01',
        ])->assertOk()->json('data');

        $this->assertSame('Curry', $res['title']);
        $this->assertSame('Lunch', $res['slot']);
        $this->assertNull($res['time']);
        $this->assertNull($res['note']);
        $this->assertSame('2026-11-01', $res['date']);
    }

    public function test_delete_removes_it_and_a_stranger_cannot_touch_someone_elses_entry(): void
    {
        $author = User::factory()->create();
        $stranger = User::factory()->create();
        $entry = $this->entry($author);

        $this->actingAs($stranger)->patchJson("/api/meal-entries/{$entry->id}", ['title' => 'x'])->assertForbidden();
        $this->deleteJson("/api/meal-entries/{$entry->id}")->assertForbidden();
        $this->assertDatabaseHas('meal_entries', ['id' => $entry->id]);

        $this->actingAs($author)->deleteJson("/api/meal-entries/{$entry->id}")->assertNoContent();
        $this->assertDatabaseMissing('meal_entries', ['id' => $entry->id]);
    }

    public function test_planning_on_a_fridge_needs_membership(): void
    {
        [, , $fridge] = $this->sharedFridge();
        $stranger = User::factory()->create();

        $this->actingAs($stranger)->postJson('/api/meal-entries', [
            'date' => '2026-10-02', 'slot' => 'Dinner', 'title' => 'X', 'fridge_id' => $fridge->id,
        ])->assertNotFound();
    }

    // ---- sharing rules --------------------------------------------------------------------

    public function test_a_pro_owned_fridge_shares_entries_with_its_members_both_ways(): void
    {
        [$owner, $member, $fridge] = $this->sharedFridge(ownerPro: true);
        $this->entry($owner, ['fridge_id' => $fridge->id, 'title' => 'Owner plan']);

        $this->assertContains('Owner plan', $this->calendarTitles($member));

        // The member can plan on the shared fridge, edit and delete it - like items and notes.
        $created = $this->actingAs($member)->postJson('/api/meal-entries', [
            'date' => now()->addDays(2)->toDateString(), 'slot' => 'Dinner', 'title' => 'Member plan', 'fridge_id' => $fridge->id,
        ])->assertCreated()->json('data');
        $this->assertContains('Member plan', $this->calendarTitles($owner));

        // Attribution is the only visible cue: others see who made it, the author sees null.
        $theirs = collect($this->actingAs($owner)->getJson('/api/calendar?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->addDays(10)->toDateString()]))->json('entries'))->firstWhere('title', 'Member plan');
        $this->assertSame($member->username, $theirs['by']);
        $mine = collect($this->actingAs($member)->getJson('/api/calendar?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->addDays(10)->toDateString()]))->json('entries'))->firstWhere('title', 'Member plan');
        $this->assertNull($mine['by']);

        $ownersEntry = MealEntry::where('title', 'Owner plan')->first();
        $this->patchJson("/api/meal-entries/{$ownersEntry->id}", ['status' => 'cooked'])->assertOk()->assertJsonPath('data.by', $owner->username);
        $this->deleteJson("/api/meal-entries/{$created['id']}")->assertNoContent();
    }

    public function test_a_non_pro_owners_fridge_keeps_entries_personal(): void
    {
        [$owner, $member, $fridge] = $this->sharedFridge(ownerPro: false);
        $entry = $this->entry($owner, ['fridge_id' => $fridge->id, 'title' => 'Owner plan']);

        $this->assertNotContains('Owner plan', $this->calendarTitles($member));
        $this->assertContains('Owner plan', $this->calendarTitles($owner));
        $this->actingAs($member)->patchJson("/api/meal-entries/{$entry->id}", ['title' => 'x'])->assertForbidden();
        $this->deleteJson("/api/meal-entries/{$entry->id}")->assertForbidden();

        // The member's own entry on that fridge is equally private to them.
        $this->actingAs($member)->postJson('/api/meal-entries', ['date' => now()->addDay()->toDateString(), 'slot' => 'Dinner', 'title' => 'Mine', 'fridge_id' => $fridge->id])->assertCreated();
        $this->assertNotContains('Mine', $this->calendarTitles($owner));
    }

    public function test_when_pro_lapses_visibility_narrows_and_nothing_is_deleted(): void
    {
        [$owner, $member, $fridge] = $this->sharedFridge(ownerPro: true);
        $this->entry($owner, ['fridge_id' => $fridge->id, 'title' => 'Shared']);
        $this->assertContains('Shared', $this->calendarTitles($member));

        $owner->forceFill(['pro_expires_at' => now()->subDay()])->save();

        $this->assertNotContains('Shared', $this->calendarTitles($member));
        $this->assertContains('Shared', $this->calendarTitles($owner));
        $this->assertDatabaseHas('meal_entries', ['title' => 'Shared']);
    }

    public function test_an_admin_granted_pro_owner_also_shares(): void
    {
        [$owner, $member, $fridge] = $this->sharedFridge(ownerPro: false);
        $owner->forceFill(['pro_granted' => true])->save();
        $this->entry($owner, ['fridge_id' => $fridge->id, 'title' => 'Granted']);

        $this->assertContains('Granted', $this->calendarTitles($member));
    }

    public function test_a_stranger_never_sees_an_entry_even_on_a_pro_fridge(): void
    {
        [$owner, , $fridge] = $this->sharedFridge(ownerPro: true);
        $this->entry($owner, ['fridge_id' => $fridge->id, 'title' => 'Private-ish']);

        $this->assertNotContains('Private-ish', $this->calendarTitles(User::factory()->create()));
    }

    public function test_the_scope_pro_query_matches_is_pro_for_every_combination(): void
    {
        $cases = [
            'free' => [],
            'subscriber' => ['pro_expires_at' => now()->addDay()],
            'lapsed' => ['pro_expires_at' => now()->subDay()],
            'granted' => ['pro_granted' => true],
            'both' => ['pro_granted' => true, 'pro_expires_at' => now()->addDay()],
        ];
        foreach ($cases as $name => $attrs) {
            $u = User::factory()->create();
            $u->forceFill($attrs)->save();
            $this->assertSame($u->fresh()->isPro(), User::pro()->whereKey($u->id)->exists(), $name);
        }
    }

    // ---- calendar scoping -----------------------------------------------------------------

    public function test_a_single_fridge_scope_shows_that_fridge_plus_personal_entries_only(): void
    {
        $user = $this->proOwner();
        $a = Fridge::create(['user_id' => $user->id, 'name' => 'A']);
        $b = Fridge::create(['user_id' => $user->id, 'name' => 'B']);
        $this->entry($user, ['fridge_id' => $a->id, 'title' => 'On A']);
        $this->entry($user, ['fridge_id' => $b->id, 'title' => 'On B']);
        $this->entry($user, ['title' => 'Personal']);

        $this->assertEqualsCanonicalizing(['On A', 'On B', 'Personal'], $this->calendarTitles($user));
        $this->assertEqualsCanonicalizing(['On A', 'Personal'], $this->calendarTitles($user, ['fridge' => $a->id]));
    }

    // ---- recipe log ------------------------------------------------------------------------

    public function test_marking_a_recipe_made_flips_todays_planned_entry(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);
        $today = now()->toDateString();
        $planned = $this->entry($user, ['recipe_id' => $recipe->id, 'title' => 'Pad Thai', 'date' => $today]);

        $this->actingAs($user)->postJson("/api/recipes/{$recipe->id}/mark-made", ['date' => $today])->assertOk();

        $this->assertSame('cooked', $planned->fresh()->status);
        $this->assertNotNull($planned->fresh()->cooked_at);
        $this->assertSame(1, MealEntry::count()); // flipped, not duplicated
    }

    public function test_marking_made_with_nothing_planned_logs_a_personal_cooked_entry(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);

        $this->actingAs($user)->postJson("/api/recipes/{$recipe->id}/mark-made", ['date' => '2026-10-05'])->assertOk();

        $log = MealEntry::first();
        $this->assertSame('cooked', $log->status);
        $this->assertSame('2026-10-05', $log->date->toDateString());
        $this->assertSame('Pad Thai', $log->title);
        $this->assertNull($log->fridge_id);
        $this->assertSame($user->id, $log->user_id);
    }

    public function test_marking_made_can_target_a_specific_entry_and_respects_access(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $recipe = $this->recipe($user);
        $mine = $this->entry($user, ['recipe_id' => $recipe->id, 'date' => '2026-10-09']);
        $theirs = $this->entry($other, ['recipe_id' => $recipe->id]);

        $this->actingAs($user)->postJson("/api/recipes/{$recipe->id}/mark-made", ['meal_entry_id' => $mine->id])->assertOk();
        $this->assertSame('cooked', $mine->fresh()->status);

        $this->postJson("/api/recipes/{$recipe->id}/mark-made", ['meal_entry_id' => $theirs->id])->assertForbidden();
        $this->assertSame('planned', $theirs->fresh()->status);
    }

    // ---- lifecycle -------------------------------------------------------------------------

    public function test_deleting_a_recipe_keeps_the_entry_and_its_title(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);
        $entry = $this->entry($user, ['recipe_id' => $recipe->id, 'title' => 'Pad Thai']);

        $recipe->delete();

        $this->assertSame('Pad Thai', $entry->fresh()->title);
        $this->assertNull($entry->fresh()->recipe_id);
    }

    public function test_deleting_a_fridge_leaves_the_authors_entry_as_personal(): void
    {
        [$owner, , $fridge] = $this->sharedFridge();
        $entry = $this->entry($owner, ['fridge_id' => $fridge->id]);

        $fridge->delete();

        $this->assertNull($entry->fresh()->fridge_id);
        $this->assertSame($owner->id, $entry->fresh()->user_id);
    }

    public function test_deleting_the_account_removes_the_users_entries(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->entry($user);
        $keep = $this->entry($other, ['title' => 'Keep']);
        $token = $user->createToken('t')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")->deleteJson('/api/me')->assertSuccessful();

        $this->assertSame([$keep->id], MealEntry::pluck('id')->all());
    }

    // ---- meal slots ------------------------------------------------------------------------

    public function test_meal_slots_are_saved_trimmed_deduplicated_and_kept_beside_other_preferences(): void
    {
        $user = User::factory()->create(['preferences' => ['goal' => 'save_money']]);

        $res = $this->actingAs($user)->patchJson('/api/me/meal-slots', ['slots' => [' Breakfast ', 'Dinner', 'dinner', '', 'Meal prep']])->assertOk();

        $this->assertSame(['Breakfast', 'Dinner', 'Meal prep'], $res->json('user.preferences.meal_slots'));
        $this->assertSame('save_money', $res->json('user.preferences.goal'));
        $this->assertSame(['Breakfast', 'Dinner', 'Meal prep'], $user->fresh()->preferences['meal_slots']);

        $this->patchJson('/api/me/meal-slots', ['slots' => []])->assertOk()->assertJsonPath('user.preferences.meal_slots', []);
        $this->patchJson('/api/me/meal-slots', ['slots' => range(1, 9)])->assertStatus(422);
        $this->patchJson('/api/me/meal-slots', ['slots' => [str_repeat('x', 41)]])->assertStatus(422);
        $this->patchJson('/api/me/meal-slots', [])->assertStatus(422);
    }

    // ---- feedback --------------------------------------------------------------------------

    public function test_feedback_is_structured_only_and_respects_the_switch(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();

        $id = $this->actingAs($user)->postJson('/api/meal-entries', [
            'date' => now()->addDays(2)->toDateString(), 'slot' => 'My secret slot', 'title' => 'Secret dinner', 'note' => 'private',
        ])->json('data.id');
        $this->patchJson("/api/meal-entries/{$id}", ['status' => 'cooked'])->assertOk();

        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'meal_plan', 'kind' => 'planned', 'source' => 'free_text', 'guess_number' => 2]);
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'meal_plan', 'kind' => 'cooked', 'outcome' => 'cooked']);
        $this->assertSame(0, AlgoFeedbackEvent::where('algo', 'meal_plan')->whereNotNull('name_key')->count());
        $this->assertSame(0, AlgoFeedbackEvent::where('guess', 'like', '%ecret%')->orWhere('final', 'like', '%ecret%')->count());

        $user->preferences = ['help_improve' => false];
        $user->save();
        $this->postJson('/api/meal-entries', ['date' => now()->toDateString(), 'slot' => 'Lunch', 'title' => 'x'])->assertCreated();
        $this->assertSame(2, AlgoFeedbackEvent::where('algo', 'meal_plan')->count());
    }

    // ---- calories --------------------------------------------------------------------------

    private function plan(User $user, array $over = [])
    {
        return $this->actingAs($user)->postJson('/api/meal-entries', array_merge(['date' => '2026-10-02', 'slot' => 'Dinner', 'title' => 'Banana'], $over));
    }

    public function test_a_free_text_meal_gets_an_estimate_from_its_name(): void
    {
        $user = User::factory()->create();

        $banana = $this->plan($user)->assertCreated()->json('data');
        $this->assertEqualsWithDelta(98, $banana['calories'], 2);
        $this->assertSame('estimate', $banana['caloriesSource']);

        $two = $this->plan($user, ['title' => 'Chicken rice'])->json('data');
        $this->assertEqualsWithDelta(474, $two['calories'], 6); // every recognised food counts

        $unknown = $this->plan($user, ['title' => 'Zorblax surprise'])->json('data');
        $this->assertNull($unknown['calories']);
        $this->assertNull($unknown['caloriesSource']);
    }

    public function test_a_recipe_meal_uses_the_recipes_per_serving_number(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);
        $recipe->forceFill(['calories' => 640, 'calories_source' => 'ai'])->saveQuietly();

        $entry = $this->plan($user, ['recipe_id' => $recipe->id, 'title' => 'Banana'])->assertCreated()->json('data');

        $this->assertSame(640, $entry['calories']); // the recipe wins over the name
        $this->assertSame('recipe', $entry['caloriesSource']);
    }

    public function test_a_typed_number_wins_and_survives_renames(): void
    {
        $user = User::factory()->create();
        $entry = $this->plan($user, ['calories' => 300])->assertCreated()->json('data');
        $this->assertSame(300, $entry['calories']);
        $this->assertSame('manual', $entry['caloriesSource']);

        $renamed = $this->patchJson("/api/meal-entries/{$entry['id']}", ['title' => 'Chicken rice'])->assertOk()->json('data');
        $this->assertSame(300, $renamed['calories']); // a manual number is never recomputed

        $status = $this->patchJson("/api/meal-entries/{$entry['id']}", ['status' => 'cooked'])->assertOk()->json('data');
        $this->assertSame(300, $status['calories']);
    }

    public function test_clearing_a_typed_number_goes_back_to_the_estimate(): void
    {
        $user = User::factory()->create();
        $entry = $this->plan($user, ['title' => 'Chicken rice', 'calories' => 300])->json('data');

        $cleared = $this->patchJson("/api/meal-entries/{$entry['id']}", ['calories' => null])->assertOk()->json('data');

        $this->assertEqualsWithDelta(474, $cleared['calories'], 6);
        $this->assertSame('estimate', $cleared['caloriesSource']);
    }

    public function test_renaming_or_changing_the_recipe_recomputes_an_estimate_but_other_edits_do_not(): void
    {
        $user = User::factory()->create();
        $entry = $this->plan($user)->json('data'); // Banana, estimate

        $same = $this->patchJson("/api/meal-entries/{$entry['id']}", ['note' => 'ripe', 'slot' => 'Lunch'])->json('data');
        $this->assertSame($entry['calories'], $same['calories']);

        $renamed = $this->patchJson("/api/meal-entries/{$entry['id']}", ['title' => 'Chicken rice'])->json('data');
        $this->assertEqualsWithDelta(474, $renamed['calories'], 6);

        $recipe = $this->recipe($user);
        $recipe->forceFill(['calories' => 555, 'calories_source' => 'algorithm'])->saveQuietly();
        $withRecipe = $this->patchJson("/api/meal-entries/{$entry['id']}", ['recipe_id' => $recipe->id])->json('data');
        $this->assertSame(555, $withRecipe['calories']);
        $this->assertSame('recipe', $withRecipe['caloriesSource']);
    }

    public function test_calories_are_validated(): void
    {
        $user = User::factory()->create();

        $this->plan($user, ['calories' => -1])->assertStatus(422);
        $this->plan($user, ['calories' => 5001])->assertStatus(422);
        $this->plan($user, ['calories' => 'lots'])->assertStatus(422);
        $this->plan($user, ['calories' => 0])->assertCreated()->assertJsonPath('data.calories', 0);
    }

    public function test_the_estimate_endpoint_is_the_table_only_and_needs_no_model(): void
    {
        Http::fake();
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/meal-entries/estimate?title=Egg+fried+rice')->assertOk()->assertJson(['calories' => 341]);
        $this->getJson('/api/meal-entries/estimate?title=Zorblax')->assertOk()->assertJson(['calories' => null]);
        $this->getJson('/api/meal-entries/estimate')->assertStatus(422);
        Http::assertNothingSent();

        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/meal-entries/estimate?title=Banana')->assertUnauthorized();
    }

    public function test_the_calendar_carries_each_meals_calories_and_a_cooked_log_takes_the_recipes(): void
    {
        $user = User::factory()->create();
        $recipe = $this->recipe($user);
        $recipe->forceFill(['calories' => 480, 'calories_source' => 'algorithm'])->saveQuietly();
        $this->plan($user, ['date' => now()->addDay()->toDateString(), 'title' => 'Banana']);

        $entries = collect($this->getJson('/api/calendar?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->addDays(3)->toDateString()]))->json('entries'))->where('kind', 'meal');
        $this->assertEqualsWithDelta(98, $entries->first()['calories'], 2);

        $this->postJson("/api/recipes/{$recipe->id}/mark-made", ['date' => '2026-10-05'])->assertOk();
        $log = MealEntry::where('date', '2026-10-05')->first();
        $this->assertSame(480, $log->calories);
        $this->assertSame('recipe', $log->calories_source);
    }
}
