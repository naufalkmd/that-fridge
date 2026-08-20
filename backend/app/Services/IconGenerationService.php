<?php

namespace App\Services;

use App\Models\GeneratedIcon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class IconGenerationService
{
    /**
     * Appended to every user prompt server-side (not user-editable) so generated icons stay
     * visually close to the curated set instead of drifting into photorealistic/busy renders.
     */
    private const STYLE_SUFFIX = ', flat vector icon, solid flat colors, transparent background, single centered object, no text, no shadow, simple minimalist food icon style';

    /**
     * The curated set is ~14-16px hand-authored pixel art rendered blocky. flux/schnell
     * always returns smooth, detailed, full-resolution art no matter how the prompt is
     * worded, so generated icons get force-downsampled to the same tiny scale before
     * storing - that's what actually makes them read as "the same style" next to the
     * curated set once both are scaled back up with pixelated rendering, not the prompt.
     */
    private const PIXEL_SIZE = 16;

    /**
     * Every curated icon has a bold dark outline around its silhouette - a big part of what
     * reads as "the same icon set". flux never draws one, so it gets synthesized here.
     */
    private const OUTLINE_COLOR = [40, 30, 25];

    public function __construct(protected FalClient $client) {}

    public function available(): bool
    {
        return $this->client->available();
    }

    /**
     * Generate an icon from a prompt, download it, and store it on the public disk.
     * Returns ['ok' => true, 'image_url' => ..., 'generated_icon_id' => ...] or
     * ['ok' => false, 'reason' => ...] - there's no honest "mock" image to fall back to
     * (unlike PhotoService's mock text data), so a missing/failed key surfaces as a real
     * failure the frontend can show a message for.
     */
    public function generateIcon(string $prompt, int $userId): array
    {
        $result = $this->client->generate($prompt.self::STYLE_SUFFIX);

        if (! $result['ok']) {
            return $result;
        }

        // flux/schnell doesn't reliably honor "transparent background" from the prompt alone -
        // it renders a plain-colored backdrop instead, which would look like a stray box behind
        // the icon in the app's UI. Run it through a background-removal pass before storing.
        $cutout = $this->client->removeBackground($result['image_url']);
        $imageUrl = $cutout['ok'] ? $cutout['image_url'] : $result['image_url'];

        try {
            $bytes = Http::get($imageUrl)->body();
            $bytes = $this->toPixelArt($bytes);
            $path = 'icons/'.Str::uuid().'.png';
            Storage::disk('public')->put($path, $bytes);
        } catch (\Exception $e) {
            Log::error('Failed to download generated icon', ['error' => $e->getMessage()]);

            return ['ok' => false, 'reason' => 'exception'];
        }

        $icon = GeneratedIcon::create([
            'user_id' => $userId,
            'prompt' => $prompt,
            'image_path' => $path,
            'image_url' => Storage::disk('public')->url($path),
        ]);

        return [
            'ok' => true,
            'image_url' => $icon->image_url,
            'generated_icon_id' => $icon->id,
        ];
    }

    /**
     * Downsample to PIXEL_SIZE, then outline it, so it reads as "the same icon set" instead
     * of just a small blurry photo.
     */
    private function toPixelArt(string $bytes): string
    {
        $src = @imagecreatefromstring($bytes);

        if (! $src) {
            return $bytes;
        }

        $size = self::PIXEL_SIZE;
        $dst = imagecreatetruecolor($size, $size);

        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
        imagefill($dst, 0, 0, $transparent);

        imagealphablending($src, false);
        imagesavealpha($src, true);

        // Curated icons are cropped tight - the subject fills 100% of the canvas edge to
        // edge. flux centers its subject with a wide transparent margin instead, which wastes
        // most of PIXEL_SIZE on empty space and makes the subject look smaller and chunkier
        // than a curated icon at the same display size. Crop to the alpha bounding box first
        // so the subject fills the frame the same way.
        [$cropX, $cropY, $cropW, $cropH] = $this->alphaBoundingBox($src);

        // Area-average resample (not imagecopyresized's nearest-neighbor point-sampling) so
        // flux's smooth gradients collapse into clean color blocks instead of noisy,
        // scattered single-pixel samples.
        imagecopyresampled($dst, $src, 0, 0, $cropX, $cropY, $size, $size, $cropW, $cropH);

        $this->boostVibrancy($dst, $size);
        $this->addOutline($dst, $size);

        ob_start();
        imagepng($dst);
        $resized = ob_get_clean();

        return $resized ?: $bytes;
    }

    /**
     * The curated set leans on punchy, saturated color - flux's output is comparatively
     * washed out even after the resample. Pushes each pixel's RGB away from its own
     * grayscale value (cheap saturation boost, no HSV round-trip needed) plus a contrast
     * bump via GD's built-in filter. Runs before the outline so the fixed dark outline
     * color isn't itself pushed around.
     */
    private function boostVibrancy(\GdImage $img, int $size): void
    {
        $saturationBoost = 1.5;

        for ($y = 0; $y < $size; $y++) {
            for ($x = 0; $x < $size; $x++) {
                $rgba = imagecolorat($img, $x, $y);
                $alpha = ($rgba >> 24) & 0x7F;

                if ($alpha >= 100) {
                    continue;
                }

                $r = ($rgba >> 16) & 0xFF;
                $g = ($rgba >> 8) & 0xFF;
                $b = $rgba & 0xFF;
                $gray = 0.299 * $r + 0.587 * $g + 0.114 * $b;

                $r = (int) max(0, min(255, $gray + ($r - $gray) * $saturationBoost));
                $g = (int) max(0, min(255, $gray + ($g - $gray) * $saturationBoost));
                $b = (int) max(0, min(255, $gray + ($b - $gray) * $saturationBoost));

                imagesetpixel($img, $x, $y, imagecolorallocatealpha($img, $r, $g, $b, $alpha));
            }
        }

        imagefilter($img, IMG_FILTER_CONTRAST, -15);
    }

    /**
     * Finds the [x, y, width, height] of the smallest rect containing every non-transparent
     * pixel. Falls back to the full image if it's entirely transparent (shouldn't happen for
     * a real generation, but avoids a zero-size crop rect if it ever does).
     */
    private function alphaBoundingBox(\GdImage $img): array
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $minX = $w;
        $minY = $h;
        $maxX = -1;
        $maxY = -1;

        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                if (((imagecolorat($img, $x, $y) >> 24) & 0x7F) < 100) {
                    $minX = min($minX, $x);
                    $minY = min($minY, $y);
                    $maxX = max($maxX, $x);
                    $maxY = max($maxY, $y);
                }
            }
        }

        if ($maxX < $minX) {
            return [0, 0, $w, $h];
        }

        return [$minX, $minY, $maxX - $minX + 1, $maxY - $minY + 1];
    }

    /**
     * Paints a 1px border around the shape's silhouette: any transparent pixel touching an
     * opaque one gets filled with OUTLINE_COLOR. Collects the pixels first and paints them in
     * a second pass so newly-painted border pixels don't themselves get treated as "opaque
     * neighbors" while the scan is still in progress.
     */
    private function addOutline(\GdImage $img, int $size): void
    {
        $isOpaque = function (int $x, int $y) use ($img, $size): bool {
            if ($x < 0 || $y < 0 || $x >= $size || $y >= $size) {
                return false;
            }

            return ((imagecolorat($img, $x, $y) >> 24) & 0x7F) < 100;
        };

        // Diagonal neighbors matter here, not just the 4 orthogonal ones - at low resolution
        // a curved/circular silhouette often only touches the next ring diagonally, and
        // checking orthogonal-only left a broken, dotted outline instead of a solid ring.
        $neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];

        $border = [];
        for ($y = 0; $y < $size; $y++) {
            for ($x = 0; $x < $size; $x++) {
                if ($isOpaque($x, $y)) {
                    continue;
                }
                foreach ($neighbors as [$dx, $dy]) {
                    if ($isOpaque($x + $dx, $y + $dy)) {
                        $border[] = [$x, $y];
                        break;
                    }
                }
            }
        }

        [$r, $g, $b] = self::OUTLINE_COLOR;
        $outlineColor = imagecolorallocatealpha($img, $r, $g, $b, 0);
        foreach ($border as [$x, $y]) {
            imagesetpixel($img, $x, $y, $outlineColor);
        }
    }
}
