<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** The service notice for the October 2026 AI outage (see app:email-ai-outage-notice). */
class AiOutageNoticeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function envelope(): Envelope
    {
        // From support@ rather than the default sender, so a reply reaches a person.
        return new Envelope(
            from: new Address('support@thatfridge.com', 'ThatFridge'),
            subject: "Good news: ThatFridge's AI features are back",
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.ai-outage-notice');
    }
}
