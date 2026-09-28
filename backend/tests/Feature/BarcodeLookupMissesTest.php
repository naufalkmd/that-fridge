<?php

namespace Tests\Feature;

use App\Models\Fridge;
use App\Models\Product;
use App\Models\Section;
use App\Models\User;
use App\Services\AlgorithmInsightsReport;
use App\Services\BarcodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class BarcodeLookupMissesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['app.algo_feedback_enabled' => true, 'app.admin_emails' => ['admin@example.com']]);
        $this->mock(BarcodeService::class, fn ($m) => $m->shouldReceive('lookup')->andReturn(null));
    }

    private function scan(User $user, string $code): void
    {
        $fridge = Fridge::firstOrCreate(['user_id' => $user->id], ['name' => 'Home']);
        $section = Section::firstOrCreate(['fridge_id' => $fridge->id], ['name' => 'Top']);
        $this->actingAs($user)->postJson("/api/sections/{$section->id}/items/barcode", ['barcode' => $code])->assertNotFound();
    }

    public function test_every_failed_lookup_is_listed_from_the_first_scan(): void
    {
        $a = User::factory()->create();
        $this->scan($a, '9556001234567');
        $this->scan($a, '9556001234567');
        $this->scan(User::factory()->create(), '9556001234567');
        $this->scan($a, '0001112223334');

        $rows = app(AlgorithmInsightsReport::class)->barcodeLookupMisses();

        $this->assertSame(['9556001234567', '0001112223334'], array_column($rows, 'barcode')); // most people first
        $this->assertSame(3, $rows[0]['scans']);
        $this->assertSame(2, $rows[0]['users']);
        $this->assertSame(1, $rows[1]['users']);
    }

    public function test_a_barcode_drops_off_once_it_is_a_product(): void
    {
        $this->scan(User::factory()->create(), '9556001234567');
        Product::create(['barcode' => '9556001234567', 'name' => 'Kaya', 'icon' => 'generic']);

        $this->assertSame([], app(AlgorithmInsightsReport::class)->barcodeLookupMisses());
    }

    public function test_the_admin_can_open_it_and_add_the_product_prefilled(): void
    {
        $this->scan(User::factory()->create(), '9556001234567');
        $admin = User::factory()->create(['email' => 'admin@example.com']);

        $this->actingAs($admin, 'web')->get('/admin/algorithm-insights')
            ->assertOk()
            ->assertSee("Barcodes we couldn't find")
            ->assertSee('9556001234567')
            ->assertSee('openfoodfacts.org/product/9556001234567', false);

        $this->actingAs($admin, 'web')->get('/admin/products/create?barcode=9556001234567')
            ->assertOk()
            ->assertSee('9556001234567');
    }
}
