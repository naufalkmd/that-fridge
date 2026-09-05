<?php

namespace App\Http\Controllers;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class RevenueCatWebhookController extends Controller
{
    /**
     * Keeps users.pro_expires_at in sync with RevenueCat so the backend can actually enforce
     * the free-tier chat quota (AgentController::send) - before this, "Pro" only existed on
     * the device via the RevenueCat SDK, so the server had no way to tell a paying subscriber
     * from anyone else with a valid login, and the free-tier limit was client-side only.
     *
     * Trusts whatever `expiration_at_ms` the event carries for the thatfridge_pro entitlement,
     * regardless of the specific event `type` (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
     * EXPIRATION, ...) - RevenueCat always sends the entitlement's current true expiration, so
     * this is self-correcting and idempotent rather than needing to branch per event type.
     * Cancellation still carries a future expiration (access continues until the period ends);
     * expiration carries a past one (which correctly makes User::isPro() false).
     */
    public function handle(Request $request)
    {
        $secret = config('services.revenuecat.webhook_secret');
        $given = (string) $request->header('Authorization', '');

        if (! $secret || ! hash_equals($secret, $given)) {
            Log::warning('RevenueCat webhook: invalid or missing Authorization header');

            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $event = $request->input('event', []);
        $appUserId = $event['app_user_id'] ?? null;
        $entitlementIds = $event['entitlement_ids'] ?? [];
        $expirationMs = $event['expiration_at_ms'] ?? null;

        if (! $appUserId || ! in_array('thatfridge_pro', $entitlementIds, true) || $expirationMs === null) {
            // Not an error - plenty of real event types (TEST, TRANSFER without this
            // entitlement, a payload RevenueCat added since this was written, ...) legitimately
            // have nothing for us to do. Always 200 so RevenueCat doesn't retry these forever.
            return response()->json(['ignored' => true], 200);
        }

        $user = User::find($appUserId);
        if (! $user) {
            Log::warning('RevenueCat webhook: no user matches app_user_id', ['app_user_id' => $appUserId]);

            return response()->json(['ignored' => true], 200);
        }

        $user->pro_expires_at = Carbon::createFromTimestampMs($expirationMs);
        $user->save();

        return response()->json(['ok' => true], 200);
    }
}
