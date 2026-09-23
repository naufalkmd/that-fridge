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

    /** Add-item "Auto-fill" shelf-life/location estimate. */
    public const AUTOFILL = 1;

    /** Text: estimate an item's calorie count from its name/weight. */
    public const CALORIE_ESTIMATE = 1;

    /** Vision: read the calorie figure off a nutrition-label photo. */
    public const LABEL_SCAN = 2;

    /** One-time AI draft of a Kitchen Lab Machine's step list from a sentence; runs
     *  afterward are AI-free and cost nothing. Refunded if no valid draft comes back. */
    public const MACHINE_BUILD = 2;
}
