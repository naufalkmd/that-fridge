<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\CreditService;
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
        $eventId = $event['id'] ?? null;
        $productId = $event['product_id'] ?? null;

        $user = $appUserId ? User::find($appUserId) : null;
        if (! $user) {
            // Not an error - TEST events, anonymous ids, a user we don't have, etc.
            return response()->json(['ignored' => true], 200);
        }

        // ---- AI credit grants -------------------------------------------------
        $credits = app(CreditService::class);

        // A consumable credit-pack purchase.
        if (isset(config('credits.packs')[$productId]) && $eventId) {
            $credits->grant($user, config('credits.packs')[$productId], 'pack_purchase', $eventId);
        }

        // Pro subscription credit handling. A free-trial period grants NOTHING - a trial user
        // keeps their free-tier balance, and the 400-credit bundle lands only once the
        // subscription converts to a paid period. Without this, starting the 7-day trial and
        // cancelling on day 6 nets 400 credits for $0, repeatable per Apple ID.
        // `period_type` is TRIAL / INTRO / NORMAL / PROMOTIONAL.
        if (in_array($productId, config('credits.pro_products'), true) && $eventId) {
            $periodType = strtoupper((string) ($event['period_type'] ?? 'NORMAL'));
            $isTrial = in_array($periodType, ['TRIAL', 'INTRO'], true);
            $isPurchase = in_array($type, ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'], true);

            if ($isTrial) {
                // Record when the trial ends so app:grant-monthly-credits treats them as a
                // free user until they actually pay.
                $trialEnd = isset($event['expiration_at_ms'])
                    ? Carbon::createFromTimestampMs($event['expiration_at_ms'])
                    : Carbon::now()->addDays(14);
                $user->forceFill(['pro_trial_until' => $trialEnd])->save();
            } elseif ($isPurchase) {
                $credits->grant($user, config('credits.pro_monthly'), 'pro_grant', $eventId, config('credits.pro_rollover_cap'));

                if ($user->pro_trial_until !== null) {
                    $user->forceFill(['pro_trial_until' => null])->save();
                }
            }
        }

        // ---- Pro entitlement sync ------------------------------------------------
        // `entitlement_ids` (array) is current; `entitlement_id` (string) is the legacy field
        // some older event shapes still send.
        $entitlementIds = $event['entitlement_ids'] ?? [];
        if (isset($event['entitlement_id'])) {
            $entitlementIds[] = $event['entitlement_id'];
        }

        if (! in_array('thatfridge_pro', $entitlementIds, true)) {
            return response()->json(['ok' => true], 200);
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
