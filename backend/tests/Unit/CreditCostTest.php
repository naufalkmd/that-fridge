<?php

namespace Tests\Unit;

use App\Support\CreditCost;
use PHPUnit\Framework\TestCase;

/**
 * Pure arithmetic with no database/container dependency - extends the framework TestCase
 * directly rather than Tests\TestCase.
 */
class CreditCostTest extends TestCase
{
    public function test_a_plain_text_turn_costs_the_base_rate(): void
    {
        $this->assertSame(CreditCost::CHAT, CreditCost::chat(0, false));
    }

    public function test_one_image_costs_the_base_image_rate(): void
    {
        $this->assertSame(CreditCost::CHAT_IMAGE, CreditCost::chat(1, false));
    }

    public function test_each_extra_image_stacks_on_top_of_the_base_image_rate(): void
    {
        $this->assertSame(CreditCost::CHAT_IMAGE + CreditCost::CHAT_EXTRA_IMAGE, CreditCost::chat(2, false));
        $this->assertSame(CreditCost::CHAT_IMAGE + 3 * CreditCost::CHAT_EXTRA_IMAGE, CreditCost::chat(4, false));
    }

    public function test_a_pdf_alone_costs_the_pdf_rate(): void
    {
        $this->assertSame(CreditCost::CHAT_PDF, CreditCost::chat(0, true));
    }

    public function test_a_pdf_with_images_adds_the_extra_image_rate_per_image_not_the_base_image_rate(): void
    {
        $this->assertSame(CreditCost::CHAT_PDF + CreditCost::CHAT_EXTRA_IMAGE, CreditCost::chat(1, true));
        $this->assertSame(CreditCost::CHAT_PDF + 2 * CreditCost::CHAT_EXTRA_IMAGE, CreditCost::chat(2, true));
    }
}
