<?php

namespace App\Mail;

use App\Models\Feedback;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class FeedbackSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Feedback $feedback) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'ThatFridge feedback from '.$this->feedback->email,
            replyTo: [$this->feedback->email],
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.feedback-submitted');
    }
}
