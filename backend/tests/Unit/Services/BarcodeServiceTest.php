<?php

namespace Tests\Unit\Services;

use App\Models\Product;
use App\Services\BarcodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BarcodeServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_lookup_returns_the_cached_product_without_any_http_calls(): void
    {
        Product::create([
            'barcode' => '123456',
            'name' => 'Cached Milk',
            'icon' => 'milk',
            'category' => 'dairy',
            'default_shelf_life_days' => 7,
            'location' => 'fridge',
        ]);
        Http::fake();

        $result = app(BarcodeService::class)->lookup('123456');

        $this->assertSame('Cached Milk', $result['name']);
        $this->assertSame('fridge', $result['location']);
        Http::assertNothingSent();
    }

    public function test_lookup_asks_the_model_for_shelf_life_and_location_on_a_fresh_barcode(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake([
            'world.openfoodfacts.org/*' => Http::response([
                'product' => [
                    'product_name' => 'Nutella',
                    'categories' => 'en:Confectionary based spreads',
                    'code' => '3017620422003',
                    'image_url' => 'https://example.com/nutella.jpg',
                ],
            ], 200),
            'openrouter.ai/*' => Http::response([
                'choices' => [['message' => ['content' => '{"shelf_life_days": 365, "location": "pantry"}']]],
            ], 200),
        ]);

        $result = app(BarcodeService::class)->lookup('3017620422003');

        $this->assertSame('Nutella', $result['name']);
        $this->assertSame(365, $result['default_shelf_life_days']);
        $this->assertSame('pantry', $result['location']);

        // and it's cached for next time, so a second lookup doesn't hit either API again.
        Http::assertSentCount(2);
        $cached = Product::where('barcode', '3017620422003')->first();
        $this->assertNotNull($cached);
        $this->assertSame('pantry', $cached->location);
    }

    public function test_lookup_falls_back_to_the_keyword_table_without_an_api_key(): void
    {
        config(['services.openrouter.key' => null]);
        Http::fake([
            'world.openfoodfacts.org/*' => Http::response([
                'product' => [
                    'product_name' => 'Some Dairy Thing',
                    'categories' => 'en:Dairy',
                    'code' => '999',
                ],
            ], 200),
        ]);

        $result = app(BarcodeService::class)->lookup('999');

        $this->assertSame('milk', $result['icon']);
        $this->assertNotNull($result['default_shelf_life_days']);
        $this->assertNotNull($result['location']);
    }

    public function test_lookup_returns_null_when_the_barcode_is_not_found(): void
    {
        Http::fake(['world.openfoodfacts.org/*' => Http::response([], 404)]);

        $result = app(BarcodeService::class)->lookup('000000');

        $this->assertNull($result);
    }

    public function test_lookup_returns_null_and_does_not_throw_on_a_connection_failure(): void
    {
        Http::fake(function () {
            throw new ConnectionException('timed out');
        });

        $result = app(BarcodeService::class)->lookup('123');

        $this->assertNull($result);
    }
}
