@component('mail::message')
# {{ $heading }}

@foreach ($lines as $line)
{{ $line }}

@endforeach
This check runs every 10 minutes. You will get this warning at most once a day while the problem lasts.
@endcomponent
