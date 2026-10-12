<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** A notice written in Admin → Service notices. The body is plain text or Markdown. */
class ServiceNoticeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $subjectLine,
        public string $body,
    ) {}

    public function envelope(): Envelope
    {
        // From support@ rather than the default sender, so a reply reaches a person.
        return new Envelope(from: new Address('support@thatfridge.com', 'ThatFridge'), subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.service-notice');
    }
}
