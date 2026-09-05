<?php

namespace App\Http\Controllers;

use App\Models\GeneratedIcon;
use App\Services\IconGenerationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class IconController extends Controller
{
    // Same shape as AgentController::FREE_CHATS_PER_WEEK - icon generation had no Pro gate and
    // no per-user cap at all (only the route's throttle:10,1), found while modeling AI costs in
    // TO_DO.md §3a. Per-image cost (fal.ai flux/schnell, ~$0.01-0.025) is noticeably higher than
    // a chat message (~$0.002), so free tier stays capped rather than fully blocked - matches
    // "Pro removes AI limits" rather than "Pro unlocks icon generation" (never documented as a
    // Pro-only feature anywhere).
    private const FREE_ICONS_PER_WEEK = 5;

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

        if (! $request->user()->isPro()) {
            $weekStart = Carbon::now()->startOfWeek(Carbon::MONDAY);
            $used = GeneratedIcon::where('user_id', $request->user()->id)
                ->where('created_at', '>=', $weekStart)
                ->count();

            if ($used >= self::FREE_ICONS_PER_WEEK) {
                return response()->json([
                    'message' => "You've used your ".self::FREE_ICONS_PER_WEEK." free icon generations this week. Upgrade to Pro for unlimited AI icons.",
                ], 402);
            }
        }

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
