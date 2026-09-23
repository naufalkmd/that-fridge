@component('mail::message')
# New feedback

**From:** {{ $feedback->email }}
@if ($feedback->user)
**Account:** {{ $feedback->user->name }} (@{{ $feedback->user->username }})
@else
**Account:** none (deleted since, or submitted anonymously)
@endif

@component('mail::panel')
{{ $feedback->message }}
@endcomponent

Reply-to is already set to the address above.

Thanks,<br>
ThatFridge
@endcomponent
