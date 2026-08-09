<?php

namespace Tests\Unit\Services;

use App\Http\Controllers\PhotoController;
use App\Http\Controllers\ReceiptController;
use App\Services\OpenRouterVisionService;
use App\Services\PhotoService;
use App\Services\ReceiptService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OpenRouterVisionServiceTest extends TestCase
{
    /**
     * OpenRouterVisionService was injected by PhotoService/ReceiptService for a whole
     * release without the class actually existing, which meant every photo/receipt scan
     * request threw a fatal DI resolution error in production. Resolving the controllers
     * that sit on top of it is the most direct regression guard against that recurring.
     */
    public function test_the_controllers_that_depend_on_it_resolve_via_the_container(): void
    {
        $this->assertInstanceOf(PhotoController::class, app(PhotoController::class));
        $this->assertInstanceOf(ReceiptController::class, app(ReceiptController::class));
        $this->assertInstanceOf(OpenRouterVisionService::class, app(OpenRouterVisionService::class));
    }

    public function test_available_reflects_whether_a_key_is_configured(): void
    {
        config(['services.openrouter.key' => null]);
        $this->assertFalse(app(OpenRouterVisionService::class)->available());

        config(['services.openrouter.key' => 'test-key']);
        $this->assertTrue(app(OpenRouterVisionService::class)->available());
    }

    public function test_analyze_image_parses_a_json_reply_wrapped_in_markdown_fences(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => "```json\n[{\"parsed_name\": \"Milk\"}]\n```"]]],
        ], 200)]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'img');
        file_put_contents($tmpFile, 'not-a-real-image-but-fine-for-this-test');

        $result = app(OpenRouterVisionService::class)->analyzeImage($tmpFile, 'image/png', 'describe it');

        unlink($tmpFile);

        $this->assertSame([['parsed_name' => 'Milk']], $result);
    }

    public function test_analyze_image_returns_null_when_the_call_fails(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], 500)]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'img');
        file_put_contents($tmpFile, 'x');

        $result = app(OpenRouterVisionService::class)->analyzeImage($tmpFile, 'image/png', 'describe it');

        unlink($tmpFile);

        $this->assertNull($result);
    }

    public function test_analyze_image_returns_null_for_an_unreadable_path_instead_of_throwing(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake();

        $result = app(OpenRouterVisionService::class)->analyzeImage('/nonexistent/path.png', 'image/png', 'describe it');

        $this->assertNull($result);
        Http::assertNothingSent();
    }
}
