<?php

namespace Tests\Unit;

use App\Services\PhotoService;
use PHPUnit\Framework\TestCase;

class PhotoBoxTest extends TestCase
{
    public function test_a_valid_box_passes_through_as_integers(): void
    {
        $this->assertSame([10, 20, 300, 400], PhotoService::normalizeBox([10, 20.4, 299.6, '400']));
    }

    public function test_values_are_clamped_to_the_0_1000_range(): void
    {
        $this->assertSame([0, 0, 1000, 800], PhotoService::normalizeBox([-40, -1, 1200, 800]));
    }

    public function test_fractions_are_scaled_to_thousandths(): void
    {
        $this->assertSame([250, 0, 750, 500], PhotoService::normalizeBox([0.25, 0, 0.75, 0.5]));
    }

    public function test_malformed_or_empty_boxes_become_null(): void
    {
        $this->assertNull(PhotoService::normalizeBox(null));
        $this->assertNull(PhotoService::normalizeBox([1, 2, 3]));
        $this->assertNull(PhotoService::normalizeBox(['a', 2, 3, 4]));
        $this->assertNull(PhotoService::normalizeBox([500, 500, 500, 900])); // no height
        $this->assertNull(PhotoService::normalizeBox([600, 100, 200, 400])); // inverted
    }
}
