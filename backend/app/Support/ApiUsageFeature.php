<?php

namespace App\Support;

/**
 * Names what an AI call was for, without touching every call site: it walks the call stack to the first caller outside the
 * provider clients and maps "Class::method" to a label an operator understands ("Quick Chat", "Receipt scan"). Anything not
 * listed falls back to the class name, so a new AI feature still shows up, just under its class until it is named here.
 */
final class ApiUsageFeature
{
    /** Frames to skip: the clients and the shared vision wrapper are plumbing, not the feature. */
    private const PLUMBING = ['OpenRouterClient', 'OpenRouterVisionService', 'FalClient', 'ApiUsageLogger', 'ApiUsageFeature'];

    /** @var array<string, string> */
    private const LABELS = [
        'AgentService::chat' => 'Quick Chat',
        'AgentService::runWithTools' => 'Quick Chat',
        'AgentService::forceTextAnswer' => 'Quick Chat',
        'AgentService::suggestItemDetails' => 'Add-item autofill',
        'AgentService::autofillItemDetails' => 'Item autofill',
        'AgentService::estimateCalories' => 'Calorie estimate',
        'AgentService::requestMachineDraft' => 'Kitchen Lab draft',
        'AgentService::tagRecipe' => 'Recipe tagging',
        'MemoryService::extractAndUpdate' => 'Chat memory',
        'ReceiptService::scan' => 'Receipt scan',
        'ReceiptService::parse' => 'Receipt scan',
        'PhotoService::scan' => 'Fridge photo scan',
        'PhotoService::detect' => 'Fridge photo scan',
        'NutritionLabelService::scan' => 'Nutrition label scan',
        'ExpiryScanService::scan' => 'Expiry date scan',
        'RecipeCalorieService' => 'Recipe calories',
        'RecipeChefService' => 'Ask Chef (recipe)',
        'MealAutofillService' => 'Ask Chef (meal plan)',
        'RecipeLinkImportService' => 'Recipe link import',
        'IconGenerationService' => 'Icon generation',
    ];

    public static function resolve(): string
    {
        $label = null;
        foreach (debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 14) as $frame) {
            $fullClass = $frame['class'] ?? '';
            // Our own team generating from the admin studios, not a user spending credits: keep the two apart on the dashboard.
            if (str_starts_with($fullClass, 'App\\Filament\\Pages\\')) {
                return 'Admin studio: '.($label ?? class_basename($fullClass));
            }
            $class = $fullClass !== '' ? class_basename($fullClass) : null;
            if ($label !== null || $class === null || in_array($class, self::PLUMBING, true)) {
                continue;
            }
            $method = $frame['function'] ?? '';
            $label = self::LABELS["{$class}::{$method}"] ?? self::LABELS[$class] ?? $class;
        }

        return $label ?? 'Other';
    }
}
