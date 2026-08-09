<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // .env has a real OPENROUTER_API_KEY (phpunit.xml doesn't override it), so without
        // this, any test that forgets to Http::fake() would silently hit the real OpenRouter/
        // Open Food Facts APIs instead of failing loudly.
        Http::preventStrayRequests();
    }
}
