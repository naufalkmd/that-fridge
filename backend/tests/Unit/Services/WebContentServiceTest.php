<?php

namespace Tests\Unit\Services;

use App\Services\WebContentService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebContentServiceTest extends TestCase
{
    private function service(): WebContentService
    {
        return app(WebContentService::class);
    }

    public function test_is_safe_url_rejects_non_http_schemes(): void
    {
        $this->assertFalse($this->service()->isSafeUrl('ftp://example.com/file'));
        $this->assertFalse($this->service()->isSafeUrl('file:///etc/passwd'));
        $this->assertFalse($this->service()->isSafeUrl('not a url'));
    }

    public function test_is_safe_url_rejects_localhost_and_private_and_link_local_addresses(): void
    {
        $this->assertFalse($this->service()->isSafeUrl('http://localhost/admin'));
        $this->assertFalse($this->service()->isSafeUrl('http://127.0.0.1:8000'));
        $this->assertFalse($this->service()->isSafeUrl('http://192.168.1.1'));
        $this->assertFalse($this->service()->isSafeUrl('http://10.0.0.5'));
        // AWS/GCP instance metadata endpoint.
        $this->assertFalse($this->service()->isSafeUrl('http://169.254.169.254/latest/meta-data/'));
    }

    public function test_is_safe_url_allows_a_public_address(): void
    {
        $this->assertTrue($this->service()->isSafeUrl('https://1.1.1.1/'));
    }

    public function test_fetch_refuses_an_unsafe_url_without_making_a_request(): void
    {
        Http::fake();

        $result = $this->service()->fetch('http://127.0.0.1/secret');

        $this->assertFalse($result['ok']);
        $this->assertSame('unsafe_url', $result['reason']);
        Http::assertNothingSent();
    }

    public function test_fetch_reduces_a_page_to_readable_text(): void
    {
        Http::fake([
            '1.1.1.1/*' => Http::response(
                '<html><head><title>Best Pancakes</title><style>.x{color:red}</style></head>'
                .'<body><script>var a=1;</script><h1>Pancakes</h1><p>Mix flour and milk.</p></body></html>',
                200,
            ),
        ]);

        $result = $this->service()->fetch('https://1.1.1.1/pancakes');

        $this->assertTrue($result['ok']);
        $this->assertSame('Best Pancakes', $result['title']);
        $this->assertStringContainsString('Pancakes', $result['text']);
        $this->assertStringContainsString('Mix flour and milk.', $result['text']);
        $this->assertStringNotContainsString('var a=1', $result['text']);
        $this->assertStringNotContainsString('color:red', $result['text']);
    }

    public function test_fetch_reports_a_failed_response(): void
    {
        Http::fake(['1.1.1.1/*' => Http::response('nope', 404)]);

        $result = $this->service()->fetch('https://1.1.1.1/missing');

        $this->assertFalse($result['ok']);
        $this->assertSame('fetch_failed', $result['reason']);
    }

    public function test_fetch_pulls_the_youtube_description_out_of_the_page_json(): void
    {
        Http::fake([
            '*youtube.com/oembed*' => Http::response('', 500),
            'youtube.com/watch*' => Http::response(
                '<html><head><title>15-min Carbonara - YouTube</title></head><body>'
                .'<script>var ytInitialPlayerResponse = {"videoDetails":{"shortDescription":"Ingredients:\n200g spaghetti\n2 eggs\nPecorino\n\nBoil pasta, mix eggs and cheese, combine off heat."}};</script>'
                .'<div>watch later share</div></body></html>',
                200,
            ),
        ]);

        $result = $this->service()->fetch('https://www.youtube.com/watch?v=abc123');

        $this->assertTrue($result['ok']);
        $this->assertStringContainsString('200g spaghetti', $result['text']);
        $this->assertStringContainsString('mix eggs and cheese', $result['text']);
    }

    public function test_fetch_uses_the_tiktok_oembed_caption(): void
    {
        Http::fake([
            '*tiktok.com/oembed*' => Http::response([
                'title' => '5-min mug cake 🍫 4 tbsp flour, 2 tbsp cocoa, 2 tbsp sugar, 3 tbsp milk, microwave 90s',
                'author_name' => 'chefkeira',
            ], 200),
            // The video page itself is a login wall from a datacenter IP.
            'tiktok.com/@*' => Http::response('<html><body>Log in to TikTok</body></html>', 200),
        ]);

        $result = $this->service()->fetch('https://www.tiktok.com/@chefkeira/video/12345');

        $this->assertTrue($result['ok']);
        $this->assertStringContainsString('4 tbsp flour', $result['text']);
        $this->assertStringContainsString('chefkeira', $result['text']);
    }

    public function test_fetch_falls_back_to_youtube_oembed_when_the_page_is_blocked(): void
    {
        Http::fake([
            '*youtube.com/oembed*' => Http::response([
                'title' => '15-Minute Carbonara',
                'author_name' => 'Pasta Pete',
            ], 200),
            'youtube.com/watch*' => Http::response('too many requests', 429),
        ]);

        $result = $this->service()->fetch('https://www.youtube.com/watch?v=blocked');

        $this->assertTrue($result['ok']);
        $this->assertSame('15-Minute Carbonara', $result['title']);
        $this->assertStringContainsString('Pasta Pete', $result['text']);
    }

    public function test_fetch_fails_when_both_the_page_and_oembed_are_unavailable(): void
    {
        Http::fake([
            '*tiktok.com/oembed*' => Http::response('', 404),
            'tiktok.com/@*' => Http::response('', 403),
        ]);

        $result = $this->service()->fetch('https://www.tiktok.com/@x/video/1');

        $this->assertFalse($result['ok']);
        $this->assertSame('fetch_failed', $result['reason']);
    }
}
