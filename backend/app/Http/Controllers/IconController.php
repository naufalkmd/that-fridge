<?php

namespace App\Http\Controllers;

use App\Models\GeneratedIcon;
use App\Services\IconGenerationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class IconController extends Controller
{
    public function __construct(protected IconGenerationService $iconService) {}

    /**
     * Every icon a user generates is already persisted (see IconGenerationService), so their
     * "library" is just that history surfaced back to them - no separate save step needed.
     */
    public function index(Request $request)
    {
        $icons = GeneratedIcon::where('user_id', $request->user()->id)
            ->latest()
            ->limit(60)
            ->get(['id', 'prompt', 'image_url'])
            ->map(fn ($icon) => [
                'id' => (string) $icon->id,
                'prompt' => $icon->prompt,
                'image_url' => $icon->image_url,
            ]);

        return response()->json(['data' => $icons]);
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:200'],
        ]);

        $result = $this->iconService->generateIcon($data['prompt'], $request->user()->id);

        if (! $result['ok']) {
            return response()->json(['message' => 'Failed to generate icon'], 502);
        }

        return response()->json([
            'icon_url' => $result['image_url'],
            'generated_icon_id' => (string) $result['generated_icon_id'],
        ]);
    }

    public function destroy(Request $request, GeneratedIcon $generatedIcon)
    {
        $this->authorize('delete', $generatedIcon);

        Storage::disk('public')->delete($generatedIcon->image_path);
        $generatedIcon->delete();

        return response()->noContent();
    }
}
