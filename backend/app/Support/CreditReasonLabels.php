<?php

namespace App\Support;

use Illuminate\Support\Str;

/** Plain names for the ledger's internal reasons, so the dashboard shows "Quick Chat (photo)" and not "chat_image". Mirrors the app's Credits screen. */
final class CreditReasonLabels
{
    private const LABELS = [
        'chat' => 'Quick Chat', 'chat_image' => 'Quick Chat (photo)', 'chat_pdf' => 'Quick Chat (PDF)', 'chat_tools' => 'Quick Chat (actions)',
        'icon' => 'Icon generation', 'expiry_scan' => 'Expiry date scan', 'receipt_scan' => 'Receipt scan', 'photo_scan' => 'Fridge photo scan',
        'label_scan' => 'Nutrition label scan', 'calorie_estimate' => 'Calorie estimate', 'autofill' => 'Add-item autofill',
        'item_autofill' => 'Item autofill', 'machine_build' => 'Kitchen Lab draft', 'meal_autofill' => 'Ask Chef (meal plan)',
        'recipe_chef' => 'Ask Chef (recipe)', 'admin_adjust' => 'Admin adjustment',
    ];

    public static function label(string $reason): string
    {
        return self::LABELS[$reason] ?? Str::headline($reason);
    }
}
