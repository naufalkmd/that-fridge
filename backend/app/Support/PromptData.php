<?php

namespace App\Support;

/**
 * User-controlled text (an item name, a note, a typed request) that is placed between our <<<...>>> data markers in a
 * model prompt. Stripping the marker characters means that text can never close the block early and pose as an
 * instruction.
 */
final class PromptData
{
    public static function clean(string $text): string
    {
        return str_replace(['<<<', '>>>'], '', $text);
    }
}
