<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserGoalResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'metricType' => $this->metric_type,
            'targetValue' => $this->target_value,
            'period' => $this->period,
            'isActive' => $this->is_active,
            'updatedAt' => $this->updated_at->getTimestamp() * 1000,
        ];
    }
}
