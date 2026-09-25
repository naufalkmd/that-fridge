<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Crypt;

/** Authenticated, short-lived proof of what the server actually suggested. */
final class ItemSuggestionToken
{
    public static function issue(User $user, string $name, array $suggestion): string
    {
        return Crypt::encryptString(json_encode([
            'user_id' => $user->id,
            'name' => trim($name),
            'issued_at' => now()->timestamp,
            'suggested_shelf_life_days' => $suggestion['shelf_life_days'] ?? null,
            'suggested_location' => $suggestion['location'] ?? null,
            'suggested_nutrition_category' => $suggestion['nutrition_category'] ?? null,
        ], JSON_THROW_ON_ERROR));
    }

    public static function read(User $user, string $name, ?string $token): array
    {
        if (! $token) {
            return [];
        }
        try {
            $data = json_decode(Crypt::decryptString($token), true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($data) || ($data['user_id'] ?? null) !== $user->id ||
                ($data['name'] ?? null) !== trim($name) ||
                ! isset($data['issued_at']) || abs(now()->timestamp - $data['issued_at']) > 86400) {
                return [];
            }

            return array_intersect_key($data, array_flip([
                'suggested_shelf_life_days', 'suggested_location', 'suggested_nutrition_category',
            ]));
        } catch (\Throwable) {
            return [];
        }
    }
}
