<?php

namespace Tests\Unit\Services;

use App\Services\MemoryService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MemoryServiceTest extends TestCase
{
    public function test_returns_existing_facts_unchanged_without_an_api_key(): void
    {
        config(['services.openrouter.key' => null]);
        Http::fake();

        $facts = app(MemoryService::class)->extractAndUpdate(['Vegetarian'], 'hi', 'hello there');

        $this->assertSame(['Vegetarian'], $facts);
        Http::assertNothingSent();
    }

    public function test_extracts_a_new_fact_from_the_exchange(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '["Vegetarian", "Dislikes cilantro"]']]],
        ], 200)]);

        $facts = app(MemoryService::class)->extractAndUpdate(
            ['Vegetarian'],
            "I'm vegetarian and I really dislike cilantro",
            "Got it, I'll keep that in mind!"
        );

        $this->assertSame(['Vegetarian', 'Dislikes cilantro'], $facts);
    }

    public function test_returns_existing_facts_unchanged_when_the_api_call_fails(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], 500)]);

        $facts = app(MemoryService::class)->extractAndUpdate(['Vegetarian'], 'hi', 'hello');

        $this->assertSame(['Vegetarian'], $facts);
    }

    public function test_returns_existing_facts_unchanged_when_the_reply_is_not_valid_json(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => 'Sure, nothing new to add!']]],
        ], 200)]);

        $facts = app(MemoryService::class)->extractAndUpdate(['Vegetarian'], 'hi', 'hello');

        $this->assertSame(['Vegetarian'], $facts);
    }

    public function test_guardrails_dedupe_case_insensitively_and_cap_at_eight_facts(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        $modelFacts = ['Vegetarian', 'vegetarian', 'VEGETARIAN', 'Fact 2', 'Fact 3', 'Fact 4', 'Fact 5', 'Fact 6', 'Fact 7', 'Fact 8'];
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode($modelFacts)]]],
        ], 200)]);

        $facts = app(MemoryService::class)->extractAndUpdate([], 'hi', 'hello');

        $this->assertCount(8, $facts);
        $this->assertSame(['Vegetarian', 'Fact 2', 'Fact 3', 'Fact 4', 'Fact 5', 'Fact 6', 'Fact 7', 'Fact 8'], $facts);
    }

    public function test_guardrails_truncate_an_overlong_fact_and_drop_empty_ones(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        $longFact = str_repeat('a', 200);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([$longFact, '', '   ', 'Real fact'])]]],
        ], 200)]);

        $facts = app(MemoryService::class)->extractAndUpdate([], 'hi', 'hello');

        $this->assertCount(2, $facts);
        $this->assertSame(80, strlen($facts[0]));
        $this->assertStringEndsWith('...', $facts[0]);
        $this->assertSame('Real fact', $facts[1]);
    }
}
