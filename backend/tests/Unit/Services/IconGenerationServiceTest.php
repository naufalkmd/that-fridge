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
}
