<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** A warning to the operator from app:check-ai-health: what is wrong, then what to do about it. */
class AiHealthAlertMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param  list<string>  $lines  one paragraph each */
    public function __construct(
        public string $heading,
        public array $lines,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "ThatFridge alert: {$this->heading}");
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.ai-health-alert');
    }
}
