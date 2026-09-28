<?php

namespace App\Support;

use Illuminate\Support\HtmlString;

/** Pixel-pack icon choices with a picture, for admin selects (allowHtml) and previews. */
final class IconPicker
{
    /** One option label: the image, then the text. */
    public static function option(?string $url, string $label): string
    {
        return '<span style="display:flex;align-items:center;gap:8px">'
            .($url ? '<img src="'.e($url).'" alt="" style="width:28px;height:28px;image-rendering:pixelated">' : '')
            .'<span>'.e($label).'</span></span>';
    }

    /**
     * Every pack icon keyed by its icon key, plus "generic" (no icon: the app guesses from the name).
     *
     * @return array<string, string>
     */
    public static function packOptions(): array
    {
        $out = ['generic' => self::option(null, 'No icon (the app guesses from the name)')];
        foreach (FoodIconMatcher::packOptions() as $key => $label) {
            $out[$key] = self::option(FoodIconMatcher::imageUrl($key), "{$label} ({$key})");
        }

        return $out;
    }

    /** A small pixel preview for an image URL, or a dash. */
    public static function preview(?string $url, int $size = 48): HtmlString
    {
        return new HtmlString($url
            ? '<img src="'.e($url).'" alt="" style="width:'.$size.'px;height:'.$size.'px;image-rendering:pixelated">'
            : '<span style="color:#9ca3af">-</span>');
    }
}
