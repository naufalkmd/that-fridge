@component('mail::message')
# Reset your password

Use this code to set a new password in the ThatFridge app:

@component('mail::panel')
# {{ $code }}
@endcomponent

It expires in {{ $expiresInMinutes }} minutes. If you didn't ask to reset your password, you can ignore this email — nothing has changed.

Thanks,<br>
ThatFridge
@endcomponent
