<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserBadgeResource;
use App\Models\UserBadge;
use App\Services\BadgeService;
use Illuminate\Http\Request;

class BadgeController extends Controller
{
    public function __construct(private BadgeService $badges) {}

    /**
     * Always returns all known badge keys (create-on-read via firstOrCreate) so the badge
     * shelf never has to guess what an absent row means.
     */
    public function index(Request $request)
    {
        $existing = $request->user()->badges()->pluck('id', 'badge_key');

        foreach (array_keys(BadgeService::BADGES) as $key) {
            if (! $existing->has($key)) {
                UserBadge::query()->create(['user_id' => $request->user()->id, 'badge_key' => $key, 'progress' => 0]);
            }
        }

        $badges = $request->user()->badges()->get();

        return UserBadgeResource::collection($badges);
    }

    public function progress(Request $request, string $badgeKey)
    {
        if (! array_key_exists($badgeKey, BadgeService::BADGES)) {
            abort(404);
        }

        $data = $request->validate([
            'incrementBy' => ['required', 'integer', 'min:1', 'max:1'],
        ]);

        $badge = $this->badges->awardProgress($request->user(), $badgeKey, $data['incrementBy']);

        // Explicit 200, not Laravel's implicit-201-for-a-freshly-created-model default - the
        // client is reporting progress on an ongoing badge, not creating a resource, even the
        // very first time this badge_key is touched for this user.
        return (new UserBadgeResource($badge))->response()->setStatusCode(200);
    }
}
