<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationPrefResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'expiryAlerts' => $this->expiry_alerts,
            'lowStock' => $this->low_stock,
            'recipeTips' => $this->recipe_tips,
            'weeklyDigest' => $this->weekly_digest,
            'crewActionsEnabled' => $this->crew_actions_enabled,
            'social' => $this->social,
        ];
    }
}
