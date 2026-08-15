<?php

namespace App\Http\Resources;

use App\Services\BadgeService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserBadgeResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'badgeKey' => $this->badge_key,
            'progress' => $this->progress,
            'target' => BadgeService::BADGES[$this->badge_key] ?? $this->progress,
            'earnedAt' => $this->earned_at ? $this->earned_at->getTimestamp() * 1000 : null,
        ];
    }
}
