<div>
    <p style="margin-bottom: 12px; font-weight: 600;">
        {{ number_format($total) }} {{ $total === 1 ? 'person' : 'people' }}@if ($shown < $total), showing the first {{ number_format($shown) }}@endif
    </p>
    @if ($total === 0)
        <p style="opacity: .7;">Nobody matches this audience.</p>
    @else
        <div style="max-height: 420px; overflow-y: auto; border: 1px solid rgba(128,128,128,.35); border-radius: 8px;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                @foreach ($rows as $row)
                    <tr style="border-top: 1px solid rgba(128,128,128,.2);">
                        <td style="padding: 6px 10px;">{{ $row['email'] }}</td>
                        @if ($row['status'])
                            <td style="padding: 6px 10px; white-space: nowrap; color: {{ $row['status'] === 'failed' ? '#dc2626' : ($row['status'] === 'sent' ? '#16a34a' : 'inherit') }};">
                                {{ $row['status'] === 'queued' ? 'waiting' : $row['status'] }}
                            </td>
                            <td style="padding: 6px 10px; opacity: .7;">{{ $row['error'] }}</td>
                        @endif
                    </tr>
                @endforeach
            </table>
        </div>
    @endif
</div>
