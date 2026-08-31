<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationPrefResource;
use Illuminate\Http\Request;

class NotificationPrefController extends Controller
{
    /**
     * @var array<string, bool>
     */
    private const DEFAULTS = [
        'expiry_alerts' => true,
        'low_stock' => true,
        'recipe_tips' => true,
        'weekly_digest' => true,
        // Crew taking real actions (adding/using items, dropping notes) is opt-in, unlike
        // the other notification-style prefs above.
        'crew_actions_enabled' => false,
        // Invites, join requests, approvals, people joining/leaving - directed at you, so on.
        'social' => true,
    ];

    public function show(Request $request)
    {
        $pref = $request->user()->notificationPref()->firstOrCreate([], self::DEFAULTS);

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
            'social' => ['sometimes', 'boolean'],
        ]);

        $pref = $request->user()->notificationPref()->firstOrCreate([], self::DEFAULTS);

        $pref->update([
            'expiry_alerts' => $data['expiryAlerts'] ?? $pref->expiry_alerts,
            'low_stock' => $data['lowStock'] ?? $pref->low_stock,
            'recipe_tips' => $data['recipeTips'] ?? $pref->recipe_tips,
            'weekly_digest' => $data['weeklyDigest'] ?? $pref->weekly_digest,
            'crew_actions_enabled' => $data['crewActionsEnabled'] ?? $pref->crew_actions_enabled,
            'social' => $data['social'] ?? $pref->social,
        ]);

        return new NotificationPrefResource($pref);
    }
}
