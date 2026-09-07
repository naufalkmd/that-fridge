<?php

namespace App\Http\Controllers;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class RevenueCatWebhookController extends Controller
{
    /**
     * A grant / non-consumable purchase that never expires has no `expiration_at_ms`, so
     * `pro_expires_at` gets a far-future sentinel instead. Any date comfortably beyond a
     * human lifetime works; kept fixed (not `now()->addYears(...)`) so re-delivering the
     * same event is idempotent.
     */
    private const NON_EXPIRING = '2999-12-31T00:00:00Z';

    /**
     * Event types that mean the entitlement is now GONE. RevenueCat sends these with a real
     * (past) `expiration_at_ms`, but if one ever arrives without it we must not fall through
     * to the "no expiry = lifetime" branch and hand the user permanent Pro.
     */
    private const ACCESS_ENDED_TYPES = ['EXPIRATION', 'SUBSCRIPTION_PAUSED'];

    /**
     * Keeps users.pro_expires_at in sync with RevenueCat so the backend can actually enforce
     * the free-tier chat quota (AgentController::send) - before this, "Pro" only existed on
     * the device via the RevenueCat SDK, so the server had no way to tell a paying subscriber
     * from anyone else with a valid login, and the free-tier limit was client-side only.
     *
     * Trusts whatever expiration the event carries for the thatfridge_pro entitlement,
     * regardless of the specific event `type` (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
     * EXPIRATION, promotional GRANT, ...) - RevenueCat always sends the entitlement's current
     * true state, so this is self-correcting and idempotent rather than branching per type.
     * Cancellation still carries a future expiration (access continues until the period ends);
     * expiration carries a past one (which correctly makes User::isPro() false); a lifetime
     * grant or non-consumable carries no expiration at all -> NON_EXPIRING.
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
        $type = $event['type'] ?? null;

        // `entitlement_ids` (array) is current; `entitlement_id` (string) is the legacy field
        // some older event shapes still send.
        $entitlementIds = $event['entitlement_ids'] ?? [];
        if (isset($event['entitlement_id'])) {
            $entitlementIds[] = $event['entitlement_id'];
        }

        if (! $appUserId || ! in_array('thatfridge_pro', $entitlementIds, true)) {
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

        $expirationMs = $event['expiration_at_ms'] ?? null;

        if ($expirationMs !== null) {
            $user->pro_expires_at = Carbon::createFromTimestampMs($expirationMs);
        } elseif (in_array($type, self::ACCESS_ENDED_TYPES, true)) {
            $user->pro_expires_at = Carbon::now();
        } else {
            // A lifetime / non-expiring grant or non-consumable purchase.
            $user->pro_expires_at = Carbon::parse(self::NON_EXPIRING);
        }

        $user->save();

        Log::info('RevenueCat webhook: synced pro_expires_at', [
            'app_user_id' => $appUserId,
            'type' => $type,
            'pro_expires_at' => $user->pro_expires_at->toIso8601String(),
        ]);

        return response()->json(['ok' => true], 200);
    }
}
