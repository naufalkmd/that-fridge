<?php

namespace Tests\Feature;

use App\Models\AlgoFeedbackEvent;
use App\Models\ChatHistory;
use App\Models\Fridge;
use App\Models\ItemOutcome;
use App\Models\Product;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\User;
use App\Services\AlgorithmInsightsReport;
use App\Support\AlgoFeedback;
use App\Support\ItemSuggestionToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AlgoFeedbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_logging_is_policy_gated_and_obeys_the_user_switch(): void
    {
        $user = User::factory()->create();
        $signal = ['kind' => 'assigned', 'name' => 'Milk 2L', 'guess' => 'milk', 'final' => 'milk'];

        AlgoFeedback::record($user, 'icon', $signal);
        $this->assertDatabaseCount('algo_feedback_events', 0);

        config(['app.algo_feedback_enabled' => true]);
        AlgoFeedback::record($user, 'icon', $signal);
        $this->assertDatabaseHas('algo_feedback_events', ['name_key' => 'milk l', 'rules_v' => AlgoFeedback::RULES_VERSION]);

        $user->preferences = ['help_improve' => false];
        $user->save();
        AlgoFeedback::record($user, 'icon', $signal);
        $this->assertDatabaseCount('algo_feedback_events', 1);
    }

    public function test_names_are_stored_only_for_rule_gaps_and_never_if_email_like(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();

        AlgoFeedback::record($user, 'food_group', ['kind' => 'assigned', 'name' => 'Eggs 12', 'class' => 'protein']);
        AlgoFeedback::record($user, 'food_group', ['kind' => 'assigned', 'name' => 'me@example.com']);
        AlgoFeedback::record($user, 'food_group', ['kind' => 'assigned', 'name' => 'Mystery 123 food']);

        $this->assertSame([null, null, 'mystery food'], AlgoFeedbackEvent::orderBy('id')->pluck('name_key')->all());
    }

    public function test_preference_and_deletion_endpoints_are_per_user(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $a = User::factory()->create();
        $b = User::factory()->create();
        AlgoFeedback::record($a, 'icon', ['kind' => 'assigned']);
        AlgoFeedback::record($b, 'icon', ['kind' => 'assigned']);
        ItemOutcome::create([
            'user_id' => $a->id, 'original_item_id' => 1, 'name_key' => 'milk',
            'outcome' => 'used', 'confidence' => 'low',
        ]);

        $this->actingAs($a)->patchJson('/api/me/improvement-preferences', ['helpImprove' => false, 'noticeSeen' => true])
            ->assertOk()->assertJsonPath('user.preferences.help_improve', false);
        $this->deleteJson('/api/me/improvement-data')->assertOk()->assertJsonPath('deleted', 1);
        $this->assertDatabaseCount('algo_feedback_events', 1);
        $this->assertDatabaseHas('algo_feedback_events', ['user_id' => $b->id]);
        $this->assertDatabaseHas('item_outcomes', ['user_id' => $a->id, 'name_key' => null]);
    }

    public function test_rollup_is_idempotent_has_no_user_id_and_hides_single_user_names(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $day = now()->subDay()->toDateString();
        foreach (range(1, 3) as $i) {
            $user = User::factory()->create();
            AlgoFeedback::record($user, 'icon', [
                'kind' => 'assigned', 'name' => 'Mysterious 99 leaf',
                'guess' => null, 'final' => 'leaf', 'outcome' => 'corrected',
            ])->forceFill(['occurred_at' => now()->subDay()])->saveQuietly();
        }
        $this->artisan('app:rollup-algo-stats', ['--date' => $day])->assertSuccessful();
        $this->artisan('app:rollup-algo-stats', ['--date' => $day])->assertSuccessful();

        $this->assertDatabaseCount('algo_stats_daily', 1);
        $row = DB::table('algo_stats_daily')->first();
        $this->assertSame(3, $row->events);
        $this->assertSame(3, $row->users);
        $this->assertSame(3, $row->corrections);
        $this->assertArrayNotHasKey('user_id', (array) $row);
        $this->assertCount(1, app(AlgorithmInsightsReport::class)->gaps());

        AlgoFeedback::record(User::factory()->create(), 'icon', [
            'kind' => 'assigned', 'name' => 'Only One Person',
        ])->forceFill(['occurred_at' => now()->subDay()])->saveQuietly();
        $this->artisan('app:rollup-algo-stats', ['--date' => $day])->assertSuccessful();
        $this->assertDatabaseHas('algo_stats_daily', [
            'events' => 1, 'users' => 1, 'name_key' => null,
        ]);

        AlgoFeedbackEvent::where('user_id', '!=', AlgoFeedbackEvent::first()->user_id)->delete();
        $this->assertCount(0, app(AlgorithmInsightsReport::class)->gaps());
    }

    public function test_suggestion_token_is_bound_to_user_and_item_name(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $token = ItemSuggestionToken::issue($a, 'Milk', [
            'shelf_life_days' => 7, 'location' => 'fridge', 'nutrition_category' => 'dairy',
        ]);

        $this->assertSame(7, ItemSuggestionToken::read($a, 'Milk', $token)['suggested_shelf_life_days']);
        $this->assertSame([], ItemSuggestionToken::read($b, 'Milk', $token));
        $this->assertSame([], ItemSuggestionToken::read($a, 'Milk extra', $token));
        $this->assertSame([], ItemSuggestionToken::read($a, 'Milk', 'invalid'));
    }

    public function test_item_save_records_server_suggestion_and_one_correction_per_changed_field(): void
    {
        $this->freezeTime(); // add_started_at is asserted as an exact number of elapsed seconds
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $token = ItemSuggestionToken::issue($user, 'Milk', [
            'shelf_life_days' => 7, 'location' => 'fridge', 'nutrition_category' => 'dairy',
        ]);

        $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk', 'icon' => 'milk', 'nutrition_category' => 'dairy',
            'location' => 'pantry', 'shelf_life_days' => 5,
            'suggestion_token' => $token,
            'source' => 'barcode', 'add_started_at' => now()->subSeconds(30)->toIso8601String(),
        ])->assertCreated();

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'add_flow', 'kind' => 'saved', 'source' => 'barcode',
            'final_number' => 30, 'outcome' => 'autofill_used',
        ]);

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'shelf_life', 'kind' => 'saved', 'guess_number' => 7, 'final_number' => 5,
        ]);
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'storage', 'kind' => 'saved', 'guess' => 'fridge', 'final' => 'pantry',
        ]);

        $item = $section->items()->firstOrFail();
        $before = AlgoFeedbackEvent::count();
        $this->patchJson("/api/items/{$item->id}", ['nutrition_category' => 'other_extras'])->assertOk();
        $this->assertSame($before + 1, AlgoFeedbackEvent::count());
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'food_group', 'kind' => 'corrected', 'guess' => 'dairy', 'final' => 'other_extras',
        ]);
    }

    public function test_unknown_barcode_reaches_item_creation_and_queue_only_after_three_users(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $users = [];
        foreach (range(1, 3) as $i) {
            $user = User::factory()->create();
            $users[] = $user;
            $fridge = Fridge::create(['user_id' => $user->id, 'name' => "Home {$i}"]);
            $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
            $this->actingAs($user)->postJson("/api/sections/{$section->id}/items", [
                'name' => 'Mystery oat milk', 'icon' => 'milk',
                'barcode_miss' => '1234567890123',
            ])->assertCreated();

            $this->assertCount($i >= 3 ? 1 : 0, app(AlgorithmInsightsReport::class)->barcodeMisses());
        }

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'barcode', 'kind' => 'miss_named',
            'guess' => '1234567890123', 'name_key' => 'mystery oat milk',
        ]);
        $this->assertSame(3, AlgoFeedbackEvent::where('algo', 'barcode')->count());

        Product::create(['barcode' => '1234567890123', 'name' => 'Mystery oat milk', 'icon' => 'milk']);
        $fridge = Fridge::create(['user_id' => $users[0]->id, 'name' => 'Second fridge']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $this->actingAs($users[0])->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Mystery oat milk', 'icon' => 'milk', 'barcode_miss' => '1234567890123',
        ])->assertCreated();
        $this->assertSame(3, AlgoFeedbackEvent::where('algo', 'barcode')->count());
    }

    public function test_chat_rating_is_structured_idempotent_and_owned_by_the_user(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $other = User::factory()->create();
        $row = ChatHistory::create([
            'user_id' => $user->id, 'agent' => 'Chef',
            'user_message' => 'What should I cook?', 'agent_response' => 'Try soup.',
        ]);

        $this->actingAs($other)->patchJson("/api/chat/{$row->id}/feedback", ['rating' => 'down'])->assertNotFound();
        $this->actingAs($user)->patchJson("/api/chat/{$row->id}/feedback", [
            'rating' => 'down', 'reason' => 'ignored_fridge',
        ])->assertOk();
        $this->patchJson("/api/chat/{$row->id}/feedback", [
            'rating' => 'down', 'reason' => 'ignored_fridge',
        ])->assertOk();

        $this->assertSame('down', $row->fresh()->feedback_rating);
        $this->assertSame(1, AlgoFeedbackEvent::where('algo', 'chat')->count());
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'chat', 'guess' => 'Chef', 'final' => 'down',
            'source' => 'ignored_fridge', 'name_key' => null,
        ]);
    }

    public function test_expiry_alert_logs_sent_then_acted_when_the_item_is_removed(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $item = $section->items()->create([
            'name' => 'Milk', 'icon' => 'milk', 'nutrition_category' => 'dairy', 'quantity' => 10,
            'expiry_date' => now()->addDay()->toDateString(), 'shelf_life_days' => 7,
        ]);
        $item->forceFill(['created_at' => now()->subDays(3)])->saveQuietly();

        $this->artisan('app:check-item-freshness');
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'expiry_alert', 'kind' => 'sent', 'source' => 'printed', 'guess_number' => 1,
        ]);

        $this->actingAs($user)->deleteJson("/api/items/{$item->id}")->assertSuccessful();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'expiry_alert', 'kind' => 'acted', 'source' => 'within_24h', 'outcome' => 'used',
        ]);
    }

    public function test_alert_signals_respect_the_sharing_switch_and_skip_unalerted_removals(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create(['preferences' => ['help_improve' => false]]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $expiring = $section->items()->create([
            'name' => 'Milk', 'icon' => 'milk', 'quantity' => 10, 'expiry_date' => now()->addDay()->toDateString(),
        ]);
        $plain = $section->items()->create(['name' => 'Rice', 'icon' => 'rice', 'quantity' => 10]);
        $plain->forceFill(['created_at' => now()->subDays(3)])->saveQuietly();

        $this->artisan('app:check-item-freshness');
        $this->actingAs($user)->deleteJson("/api/items/{$expiring->id}")->assertSuccessful();
        $this->assertDatabaseMissing('algo_feedback_events', ['algo' => 'expiry_alert']);

        $user->preferences = ['help_improve' => true];
        $user->save();
        $this->deleteJson("/api/items/{$plain->id}")->assertSuccessful();
        $this->assertDatabaseMissing('algo_feedback_events', ['algo' => 'expiry_alert', 'kind' => 'acted']);
    }

    public function test_scan_logs_detected_count_and_parsed_vs_kept_name(): void
    {
        config(['app.algo_feedback_enabled' => true, 'services.openrouter.key' => null]);
        $user = User::factory()->create(['ai_credits' => 10]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);

        $detected = $this->actingAs($user)->post("/api/sections/{$section->id}/items/receipt/scan", [
            'image' => UploadedFile::fake()->image('receipt.jpg'),
        ])->assertOk()->json('detected_items');
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'scan', 'kind' => 'detected', 'source' => 'receipt', 'guess_number' => count($detected),
        ]);

        $this->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Milk', 'icon' => 'milk', 'source' => 'receipt', 'parsed_name' => 'Milk',
        ])->assertCreated();
        $this->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Full cream milk', 'icon' => 'milk', 'source' => 'receipt', 'parsed_name' => 'Milk 2L',
        ])->assertCreated();
        // A manual add that happens to carry parsed_name is not a scan result.
        $this->postJson("/api/sections/{$section->id}/items", [
            'name' => 'Tea', 'icon' => 'tea', 'source' => 'manual', 'parsed_name' => 'Tea',
        ])->assertCreated();

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'scan', 'kind' => 'saved', 'outcome' => 'accepted', 'guess' => null,
        ]);
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'scan', 'kind' => 'saved', 'outcome' => 'corrected', 'guess' => 'milk l', 'final' => 'full cream milk',
        ]);
        $this->assertSame(2, AlgoFeedbackEvent::where('algo', 'scan')->where('kind', 'saved')->count());
    }

    public function test_autofill_logs_proposed_fields_then_accepted_or_changed_when_applied(): void
    {
        config(['app.algo_feedback_enabled' => true, 'services.openrouter.key' => null]);
        $user = User::factory()->create(['ai_credits' => 5]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $item = $section->items()->create(['name' => 'Greek Yogurt', 'icon' => 'yogurt']);

        $fields = $this->actingAs($user)->postJson("/api/items/{$item->id}/autofill")->assertOk()->json('fields');
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'autofill', 'kind' => 'proposed', 'guess' => 'calories']);
        $proposed = AlgoFeedbackEvent::where('algo', 'autofill')->where('kind', 'proposed')->count();
        $this->assertGreaterThanOrEqual(3, $proposed);

        // An unrelated edit must not consume the pending proposal.
        $this->patchJson("/api/items/{$item->id}", ['note' => 'hi'])->assertOk();
        $this->assertDatabaseMissing('algo_feedback_events', ['algo' => 'autofill', 'kind' => 'applied']);

        // "Use these" with the calories bumped by the user: calories changed, the rest accepted.
        $this->patchJson("/api/items/{$item->id}", [
            'calories' => $fields['calories'] + 50, 'shelf_life_days' => $fields['shelf_life_days'],
        ])->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'autofill', 'kind' => 'applied', 'guess' => 'calories', 'outcome' => 'changed']);
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'autofill', 'kind' => 'applied', 'guess' => 'shelf_life_days', 'outcome' => 'accepted']);

        // The proposal is consumed: a later edit of the same field logs no second "applied".
        $before = AlgoFeedbackEvent::where('kind', 'applied')->count();
        $this->patchJson("/api/items/{$item->id}", ['calories' => 1])->assertOk();
        $this->assertSame($before, AlgoFeedbackEvent::where('kind', 'applied')->count());
    }

    public function test_notification_toggles_log_only_real_changes(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/notification-prefs', ['lowStock' => false, 'recipeTips' => true])->assertSuccessful();

        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'notification_pref', 'kind' => 'toggled', 'class' => 'low_stock', 'outcome' => 'off',
        ]);
        $this->assertSame(1, AlgoFeedbackEvent::where('algo', 'notification_pref')->count());
    }

    public function test_low_stock_alert_logs_sent_then_acted_when_added_to_the_shopping_list(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $section->items()->create(['name' => 'Bun', 'icon' => 'bread', 'quantity' => 1]);

        $this->artisan('app:check-item-freshness');
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'low_stock', 'kind' => 'sent', 'guess_number' => 1]);

        $this->actingAs($user)->postJson("/api/fridges/{$fridge->id}/shopping-items", ['name' => 'Eggs', 'section' => 'Other'])->assertCreated();
        $this->assertDatabaseMissing('algo_feedback_events', ['algo' => 'low_stock', 'kind' => 'acted']);

        $this->postJson("/api/fridges/{$fridge->id}/shopping-items", ['name' => 'bun', 'section' => 'Other'])->assertCreated();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'low_stock', 'kind' => 'acted', 'outcome' => 'added_to_shopping',
        ]);
    }

    public function test_recipe_made_logs_the_rank_it_had_in_the_last_suggestion_list(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $make = fn (string $name, array $vibes) => Recipe::create([
            'user_id' => $user->id, 'name' => $name, 'minutes' => 20, 'ingredients' => [['name' => 'Rice', 'icon' => 'rice']],
            'steps' => ['Cook'], 'meal_type' => 'dinner', 'vibes' => $vibes, 'food_focus' => [], 'made_count' => 0,
        ]);
        $best = $make('Best', ['comfort', 'quick_easy']);
        $second = $make('Second', ['comfort']);
        $other = $make('Other', []);

        $this->actingAs($user)->getJson('/api/recipes/suggest?vibes[]=comfort&vibes[]=quick_easy')->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'recipe', 'kind' => 'suggested', 'guess' => 'comfort+quick_easy', 'source' => 'criteria', 'guess_number' => 2,
        ]);

        $this->postJson("/api/recipes/{$second->id}/mark-made")->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'recipe', 'kind' => 'made', 'final_number' => 2, 'guess_number' => 2, 'source' => 'suggested',
        ]);

        // The list is consumed, and a recipe outside it is logged as unranked.
        $this->postJson("/api/recipes/{$other->id}/mark-made")->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'recipe', 'kind' => 'made', 'final_number' => null, 'guess_number' => null, 'source' => 'not_suggested',
        ]);
        $this->assertNotNull($best);
    }

    public function test_kitchen_lab_logs_draft_redraft_save_outcome_enable_and_undo_without_prompt_text(): void
    {
        config(['app.algo_feedback_enabled' => true, 'services.openrouter.key' => 'test-key']);
        $user = User::factory()->create(['ai_credits' => 10]);
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $draft = [
            'name' => 'Daily calories',
            'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '08:00']],
            'steps' => [
                ['tool' => 'sum_item_field', 'args' => ['field' => 'calories']],
                ['tool' => 'notify_user', 'args' => ['message' => 'Total: {step1}']],
            ],
        ];
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => json_encode($draft)]]]], 200)]);

        $this->actingAs($user)->postJson('/api/machines/draft', ['prompt' => 'secret prompt text'])->assertOk();
        $this->postJson('/api/machines/draft', ['prompt' => 'secret prompt text'])->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'drafted', 'source' => 'schedule', 'guess_number' => 2]);
        $this->assertSame(1, AlgoFeedbackEvent::where('kind', 'redrafted')->count());

        // Saved untouched vs edited vs built by hand.
        $save = fn (array $over = []) => $this->postJson('/api/machines', array_merge($draft, ['fridge_id' => $fridge->id], $over));
        $machine = $save()->assertCreated();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'saved', 'outcome' => 'as_is', 'guess_number' => 2, 'final_number' => 2]);

        $save()->assertCreated(); // the draft was consumed by the first save
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'saved', 'outcome' => 'hand_built', 'guess_number' => null]);

        $this->postJson('/api/machines/draft', ['prompt' => 'again'])->assertOk();
        $save(['trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'daily', 'time' => '09:30']]])->assertCreated();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'saved', 'outcome' => 'edited']);

        $save(['steps' => [['tool' => 'not_a_tool', 'args' => []]]])->assertStatus(422);
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'save_rejected']);

        // Enabling: with a prior dry run vs without.
        $id = $machine->json('data.id');
        $this->postJson("/api/machines/{$id}/dry-run")->assertOk();
        $this->patchJson("/api/machines/{$id}", ['enabled' => true])->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'enabled', 'outcome' => 'dry_run_first']);
        $other = $save()->assertCreated()->json('data.id');
        $this->patchJson("/api/machines/{$other}", ['enabled' => true])->assertOk();
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'kitchen_lab', 'kind' => 'enabled', 'outcome' => 'no_dry_run']);

        // Nothing user-typed is stored.
        $this->assertSame(0, AlgoFeedbackEvent::where('algo', 'kitchen_lab')->whereNotNull('name_key')->count());
        $this->assertSame(0, AlgoFeedbackEvent::where('guess', 'like', '%secret%')->count());
    }

    public function test_restock_logs_days_since_the_same_item_was_removed(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Home']);
        $section = Section::create(['fridge_id' => $fridge->id, 'name' => 'Top']);
        $milk = $section->items()->create(['name' => 'Milk 2L', 'icon' => 'milk', 'nutrition_category' => 'dairy']);
        $milk->forceFill(['created_at' => now()->subDays(20)])->saveQuietly();

        $this->actingAs($user)->deleteJson("/api/items/{$milk->id}")->assertSuccessful();
        ItemOutcome::query()->update(['created_at' => now()->subDays(6)]);

        $this->postJson("/api/sections/{$section->id}/items", ['name' => 'milk 1l', 'icon' => 'milk'])->assertCreated();
        $this->assertDatabaseHas('algo_feedback_events', [
            'algo' => 'restock', 'kind' => 'readded', 'final_number' => 6, 'outcome' => 'used', 'class' => 'dairy',
        ]);

        // Something never removed before is not a restock.
        $this->postJson("/api/sections/{$section->id}/items", ['name' => 'Tofu', 'icon' => 'tofu'])->assertCreated();
        $this->assertSame(1, AlgoFeedbackEvent::where('algo', 'restock')->count());
    }

    public function test_home_tip_taps_are_logged_as_fixed_enums_and_respect_the_switch(): void
    {
        config(['app.algo_feedback_enabled' => true]);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/tip-feedback', ['tip' => 'guardian', 'action' => 'dismissed'])->assertNoContent();
        $this->postJson('/api/tip-feedback', ['tip' => 'chef', 'action' => 'opened'])->assertNoContent();
        $this->postJson('/api/tip-feedback', ['tip' => 'anything typed', 'action' => 'opened'])->assertStatus(422);

        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'home_tip', 'kind' => 'dismissed', 'class' => 'guardian']);
        $this->assertDatabaseHas('algo_feedback_events', ['algo' => 'home_tip', 'kind' => 'opened', 'class' => 'chef']);

        $user->preferences = ['help_improve' => false];
        $user->save();
        $this->postJson('/api/tip-feedback', ['tip' => 'lowStock', 'action' => 'opened'])->assertNoContent();
        $this->assertSame(2, AlgoFeedbackEvent::where('algo', 'home_tip')->count());

        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/tip-feedback', ['tip' => 'chef', 'action' => 'opened'])->assertUnauthorized();
    }
}
