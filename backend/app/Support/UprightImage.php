<?php

namespace App\Support;

/**
 * Phone JPEGs often store pixels sideways plus an EXIF Orientation tag. The phone displays them
 * upright, but a vision model may read the raw pixels - and then the bounding boxes it returns
 * don't line up with the photo on screen. This bakes the rotation into a temporary copy.
 */
final class UprightImage
{
    /**
     * Path to an upright temporary copy of the JPEG, or null when it's already upright, isn't
     * a JPEG, or GD/EXIF aren't available (callers then use the original). Delete the copy after use.
     */
    public static function copy(string $path, ?string $mimeType): ?string
    {
        if (! in_array($mimeType, ['image/jpeg', 'image/jpg'], true)
            || ! function_exists('exif_read_data') || ! function_exists('imagecreatefromjpeg')) {
            return null;
        }

        $exif = @exif_read_data($path);
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return null;
        }

        $image = @imagecreatefromjpeg($path);
        if ($image === false) {
            return null;
        }

        $rotated = imagerotate($image, $angle, 0);
        if ($rotated === false) {
            return null;
        }

        $out = tempnam(sys_get_temp_dir(), 'upright');
        if ($out === false || ! imagejpeg($rotated, $out, 85)) {
            return null;
        }

        return $out;
    }
}
