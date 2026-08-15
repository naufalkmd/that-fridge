<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UsageHistoryResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'icon' => $this->icon,
            'category' => $this->category,
            'count' => $this->count,
            'freshUseCount' => $this->fresh_use_count,
            'freshnessSum' => $this->freshness_sum,
            'freshnessSampleCount' => $this->freshness_sample_count,
            'lastAt' => $this->last_used_at->getTimestamp() * 1000,
        ];
    }
}
