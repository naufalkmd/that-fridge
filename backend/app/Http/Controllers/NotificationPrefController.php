<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationPrefResource;
use Illuminate\Http\Request;

class NotificationPrefController extends Controller
{
    public function show(Request $request)
    {
        $pref = $request->user()->notificationPref()->firstOrCreate([], [
            'expiry_alerts' => true,
            'low_stock' => true,
            'recipe_tips' => true,
            'weekly_digest' => true,
            // Crew taking real actions (moving items, adding to the shopping list) is
            // opt-in, unlike the other notification-style prefs above.
            'crew_actions_enabled' => false,
        ]);

        return new NotificationPrefResource($pref);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'expiryAlerts' => ['sometimes', 'boolean'],
            'lowStock' => ['sometimes', 'boolean'],
            'recipeTips' => ['sometimes', 'boolean'],
            'weeklyDigest' => ['sometimes', 'boolean'],
            'crewActionsEnabled' => ['sometimes', 'boolean'],
        ]);

        $pref = $request->user()->notificationPref()->firstOrCreate([], [
            'expiry_alerts' => true,
            'low_stock' => true,
            'recipe_tips' => true,
            'weekly_digest' => true,
            'crew_actions_enabled' => false,
        ]);

        $pref->update([
            'expiry_alerts' => $data['expiryAlerts'] ?? $pref->expiry_alerts,
            'low_stock' => $data['lowStock'] ?? $pref->low_stock,
            'recipe_tips' => $data['recipeTips'] ?? $pref->recipe_tips,
            'weekly_digest' => $data['weeklyDigest'] ?? $pref->weekly_digest,
            'crew_actions_enabled' => $data['crewActionsEnabled'] ?? $pref->crew_actions_enabled,
        ]);

        return new NotificationPrefResource($pref);
    }
}
