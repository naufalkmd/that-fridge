<?php

namespace App\Support;

/**
 * What each AI action costs in credits. 1 credit ~= $0.01 of value; the packs carry the
 * markup. Deliberately coarse - tune with real usage data, the ledger makes it safe.
 */
final class CreditCost
{
    /** A plain Quick Chat / tip-card message. */
    public const CHAT = 1;

    /** A Quick Chat message that carries a photo - vision runs ~3-5x the cost of plain text. */
    public const CHAT_IMAGE = 3;

    /** Each extra image beyond the first on the same chat turn - additional vision tokens,
     *  not a second full turn, so priced lower than CHAT_IMAGE itself. */
    public const CHAT_EXTRA_IMAGE = 1;

    /** A Quick Chat message that carries a PDF - document parsing runs heavier than a single
     *  image (more input tokens, sometimes OCR'd), so priced above CHAT_IMAGE. */
    public const CHAT_PDF = 5;

    /** Extra, charged after the fact, when that chat turn actually ran one or more tools. */
    public const CHAT_TOOL_SURCHARGE = 2;

    /** fal.ai icon / recipe-icon generation. */
    public const ICON = 3;

    /** Vision: read an expiry date off a photo. */
    public const EXPIRY_SCAN = 2;

    /** Vision: parse a grocery receipt. */
    public const RECEIPT_SCAN = 3;

    /** Vision: detect items from a fridge photo. */
    public const PHOTO_SCAN = 3;

    /** Add-item "Auto-fill" shelf-life/location estimate, and the item detail page's
     *  "Autofill" (weight/calories/shelf-life/food group in one call). */
    public const AUTOFILL = 1;

    /** Text: estimate an item's calorie count from its name/weight. */
    public const CALORIE_ESTIMATE = 1;

    /** Vision: read the calorie figure off a nutrition-label photo. */
    public const LABEL_SCAN = 2;

    /** One-time AI draft of a Kitchen Lab Machine's step list from a sentence; runs
     *  afterward are AI-free and cost nothing. Refunded if no valid draft comes back. */
    public const MACHINE_BUILD = 2;

    /** One AI call that fills a week's empty meal-plan slots from what's expiring and the recipe book.
     *  Refunded if no meal comes back; nothing is charged when there is nothing to fill. */
    public const MEAL_AUTOFILL = 3;

    /**
     * What one Quick Chat turn costs given how many images (0-4) rode along and whether a
     * PDF did too - a PDF's base cost already covers its own document parsing, so only
     * images stack an extra charge on top of it; without a PDF, the first image sets the
     * base CHAT_IMAGE rate and only images after it stack the extra charge. A plain-text
     * turn with neither just costs CHAT.
     */
    public static function chat(int $imageCount, bool $hasPdf): int
    {
        if ($hasPdf) {
            return self::CHAT_PDF + $imageCount * self::CHAT_EXTRA_IMAGE;
        }

        if ($imageCount > 0) {
            return self::CHAT_IMAGE + ($imageCount - 1) * self::CHAT_EXTRA_IMAGE;
        }

        return self::CHAT;
    }
}
