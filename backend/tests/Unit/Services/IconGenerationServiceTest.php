<?php

namespace Tests\Unit\Services;

use App\Models\GeneratedIcon;
use App\Models\User;
use App\Services\FalClient;
use App\Services\IconGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class IconGenerationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_generated_icon_is_stored_as_crisp_upscaled_pixel_art(): void
    {
        Storage::fake('public');

        // A smooth 512px gradient square standing in for flux's output.
        $big = imagecreatetruecolor(512, 512);
        for ($y = 0; $y < 512; $y++) {
            imagefilledrectangle($big, 0, $y, 511, $y, imagecolorallocate($big, $y / 2, 120, 200));
        }
        ob_start();
        imagepng($big);
        $sourcePng = ob_get_clean();

        Http::fake([
            'cdn.test/*' => Http::response($sourcePng, 200, ['Content-Type' => 'image/png']),
        ]);

        $this->mock(FalClient::class, function ($m) {
            $m->shouldReceive('generate')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/raw.png']);
            $m->shouldReceive('removeBackground')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/cutout.png']);
        });

        $user = User::factory()->create();

        $result = app(IconGenerationService::class)->generateIcon('a ripe tomato', $user->id);

        $this->assertTrue($result['ok']);

        $icon = GeneratedIcon::findOrFail($result['generated_icon_id']);
        $stored = Storage::disk('public')->get($icon->image_path);
        [$w, $h] = getimagesizefromstring($stored);

        // Stored at 128², not the 16² working size and not flux's 512².
        $this->assertSame(128, $w);
        $this->assertSame(128, $h);
    }

    public function test_the_food_is_described_first_and_the_description_is_what_gets_drawn(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake([
            'openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => '"Nasi lemak: coconut rice with sambal, anchovies and half an egg on a banana leaf."']]]], 200),
            'cdn.test/*' => Http::response($this->png(), 200, ['Content-Type' => 'image/png']),
        ]);
        $prompts = [];
        $this->mock(FalClient::class, function ($m) use (&$prompts) {
            $m->shouldReceive('generate')->andReturnUsing(function ($p) use (&$prompts) {
                $prompts[] = $p;

                return ['ok' => true, 'image_url' => 'https://cdn.test/raw.png'];
            });
            $m->shouldReceive('removeBackground')->andReturn(['ok' => true, 'image_url' => 'https://cdn.test/cutout.png']);
        });
        Storage::fake('public');
        $user = User::factory()->create();

        app(IconGenerationService::class)->generateIcon('nasi lemak', $user->id);
        app(IconGenerationService::class)->generateIcon('Nasi Lemak ', $user->id);

        $this->assertStringStartsWith('Nasi lemak: coconut rice with sambal', $prompts[0]);
        $this->assertStringContainsString('flat vector icon', $prompts[0]);
        // Cached per name: the second generation reuses the description.
        Http::assertSentCount(1 + 2);
        $this->assertSame('nasi lemak', GeneratedIcon::first()->prompt); // the icon keeps the name the user typed
    }

    public function test_without_an_ai_key_the_name_is_drawn_as_typed(): void
    {
        config(['services.openrouter.key' => null]);
        Http::fake(['cdn.test/*' => Http::response($this->png(), 200, ['Content-Type' => 'image/png'])]);
        $prompts = [];
        $this->mock(FalClient::class, function ($m) use (&$prompts) {
            $m->shouldReceive('generate')->andReturnUsing(function ($p) use (&$prompts) {
                $prompts[] = $p;

                return ['ok' => true, 'image_url' => 'https://cdn.test/raw.png'];
            });
            $m->shouldReceive('removeBackground')->andReturn(['ok' => false]);
        });
        Storage::fake('public');

        app(IconGenerationService::class)->generateIcon('a ripe tomato', User::factory()->create()->id);

        $this->assertStringStartsWith('a ripe tomato, flat vector icon', $prompts[0]);
    }

    private function png(): string
    {
        $img = imagecreatetruecolor(64, 64);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 60, 60));
        ob_start();
        imagepng($img);

        return (string) ob_get_clean();
    }
}
