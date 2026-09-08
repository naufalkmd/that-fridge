<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Fetches a user-supplied URL and reduces it to plain readable text, with the classic
 * SSRF guards. Shared by RecipeLinkImportService (the recipe form's "paste a link" field)
 * and AgentService's fetch_url tool (Quick Chat browsing).
 *
 * For video hosts (YouTube, TikTok) the readable page body is mostly navigation chrome -
 * the actual recipe usually lives in the video description / caption, which sits in a JSON
 * blob inside a <script> tag. We pull that out explicitly before the script-stripping pass
 * throws it away.
 */
class WebContentService
{
    private const MAX_CHARS = 8000;

    private const TIMEOUT_SECONDS = 8;

    private const MAX_REDIRECTS = 3;

    private const USER_AGENT = 'Mozilla/5.0 (compatible; ThatFridgeBot/1.0; +https://thatfridge.com)';

    /**
     * @return array{ok: bool, text: string, title: ?string, reason: ?string}
     */
    public function fetch(string $url): array
    {
        if (! $this->isSafeUrl($url)) {
            return ['ok' => false, 'text' => '', 'title' => null, 'reason' => 'unsafe_url'];
        }

        $host = strtolower(parse_url($url, PHP_URL_HOST) ?: '');

        // YouTube and TikTok serve a bot wall to a datacenter IP as often as not, and their
        // short links redirect. Their public oEmbed endpoint is a fixed, safe URL that
        // reliably returns the title + author (and, for TikTok, the caption - which is where
        // the recipe usually is). Try it first, then still attempt the page for a fuller
        // description; whichever produced text wins.
        $oembed = $this->isVideoHost($host) ? $this->fetchOembed($url, $host) : null;
        $page = $this->fetchPage($url);

        if ($oembed === null && $page === null) {
            return ['ok' => false, 'text' => '', 'title' => null, 'reason' => 'fetch_failed'];
        }

        $title = $page['title'] ?? $oembed['title'] ?? null;
        $caption = $page['video'] ?? $oembed['caption'] ?? null;
        $author = $oembed['author'] ?? null;
        $body = $page['body'] ?? null;

        $text = trim(implode("\n\n", array_filter([
            $title ? "Page title: {$title}" : null,
            $author ? "Posted by: {$author}" : null,
            $caption ? "Video description / caption:\n{$caption}" : null,
            $body,
        ])));

        if ($text === '') {
            return ['ok' => false, 'text' => '', 'title' => $title, 'reason' => 'empty'];
        }

        return [
            'ok' => true,
            'text' => mb_substr($text, 0, self::MAX_CHARS),
            'title' => $title,
            'reason' => null,
        ];
    }

    private function isVideoHost(string $host): bool
    {
        return str_contains($host, 'youtube.com')
            || str_contains($host, 'youtu.be')
            || str_contains($host, 'tiktok.com');
    }

    /**
     * Hit the platform's public oEmbed endpoint (a fixed host, so no SSRF surface). Returns
     * null for a non-video host or any failure. For TikTok the `title` field carries the
     * caption; for YouTube it's the video title and there's no caption.
     *
     * @return array{title: ?string, caption: ?string, author: ?string}|null
     */
    private function fetchOembed(string $url, string $host): ?array
    {
        $isTikTok = str_contains($host, 'tiktok.com');
        $endpoint = $isTikTok
            ? 'https://www.tiktok.com/oembed'
            : 'https://www.youtube.com/oembed';
        $oembedUrl = $endpoint.'?'.http_build_query(['url' => $url, 'format' => 'json']);

        if (! $this->isSafeUrl($oembedUrl)) {
            return null;
        }

        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->withHeaders(['User-Agent' => self::USER_AGENT, 'Accept' => 'application/json'])
                ->get($oembedUrl);

            if (! $response->successful()) {
                return null;
            }

            $data = json_decode($response->body(), true);
            if (! is_array($data)) {
                return null;
            }

            $primary = is_string($data['title'] ?? null) ? trim($data['title']) : '';
            $author = is_string($data['author_name'] ?? null) ? trim($data['author_name']) : '';

            $result = [
                'title' => $isTikTok || $primary === '' ? null : mb_substr($primary, 0, 200),
                'caption' => $isTikTok && $primary !== '' ? mb_substr($primary, 0, self::MAX_CHARS) : null,
                'author' => $author !== '' ? mb_substr($author, 0, 120) : null,
            ];

            return array_filter($result) === [] ? null : $result;
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Fetch and parse the page. Redirects are NOT auto-followed - we walk them by hand so
     * every hop is validated AND the connection is pinned to the exact IP we validated
     * (curl's CURLOPT_RESOLVE), closing the DNS-rebinding window where a host resolves to a
     * public IP for the safety check and an internal one for the actual request.
     * Returns null on any failure.
     *
     * @return array{title: ?string, video: ?string, body: string}|null
     */
    private function fetchPage(string $url): ?array
    {
        try {
            $current = $url;

            for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
                $pin = $this->safeResolve($current);
                if ($pin === null) {
                    return null;
                }

                $response = Http::withOptions([
                    'allow_redirects' => false,
                    'curl' => [CURLOPT_RESOLVE => ["{$pin['host']}:{$pin['port']}:{$pin['ip']}"]],
                ])
                    ->timeout(self::TIMEOUT_SECONDS)
                    ->withHeaders([
                        'User-Agent' => self::USER_AGENT,
                        'Accept' => 'text/html,application/xhtml+xml',
                        'Accept-Language' => 'en-US,en;q=0.9',
                    ])
                    ->get($current);

                if ($response->redirect()) {
                    $location = $response->header('Location');
                    if (! $location) {
                        return null;
                    }
                    // Resolve a relative Location against the URL that issued the redirect.
                    $current = $this->absoluteUrl($current, $location);

                    continue;
                }

                if (! $response->successful()) {
                    return null;
                }

                $html = $response->body();

                return [
                    'title' => $this->extractTitle($html),
                    'video' => $this->extractVideoDescription($current, $html),
                    'body' => $this->extractReadableText($html),
                ];
            }

            return null; // too many redirects
        } catch (\Exception $e) {
            Log::warning('Web page fetch failed', ['url' => $url, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /** Resolve a possibly-relative Location header against the URL it came from. */
    private function absoluteUrl(string $base, string $location): string
    {
        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }
        $b = parse_url($base);
        $scheme = $b['scheme'] ?? 'https';
        $host = $b['host'] ?? '';
        $port = isset($b['port']) ? ':'.$b['port'] : '';
        $path = str_starts_with($location, '/') ? $location : '/'.$location;

        return "{$scheme}://{$host}{$port}{$path}";
    }

    /**
     * Blocks the classic SSRF targets (localhost, cloud metadata endpoints, internal/private
     * networks). Kept as a plain boolean for callers that just need a yes/no (oEmbed, tests);
     * fetchPage() uses safeResolve() directly so it can pin the connection.
     */
    public function isSafeUrl(string $url): bool
    {
        return $this->safeResolve($url) !== null;
    }

    /**
     * Parse + resolve a URL and validate EVERY IP the host resolves to (A and AAAA). Returns
     * the host/port and one validated IP to pin the connection to, or null if anything about
     * it is unsafe: non-http(s) scheme, unresolvable host, or any resolved address in a
     * private / reserved / loopback / link-local range (which is where cloud metadata and
     * internal services live).
     *
     * @return array{host: string, port: int, ip: string}|null
     */
    private function safeResolve(string $url): ?array
    {
        $parts = parse_url($url);

        if (! $parts || ! in_array($parts['scheme'] ?? null, ['http', 'https'], true) || empty($parts['host'])) {
            return null;
        }

        $host = $parts['host'];
        $port = (int) ($parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80));

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips = [$host];
        } else {
            $ips = array_merge(
                gethostbynamel($host) ?: [],
                array_column(@dns_get_record($host, DNS_AAAA) ?: [], 'ipv6'),
            );
        }

        if ($ips === []) {
            return null;
        }

        // One bad address anywhere in the set fails the whole URL - a rebind attack relies on
        // returning a good IP and a bad IP and hoping the connection picks the bad one.
        foreach ($ips as $ip) {
            if (! $this->ipIsPublic($ip)) {
                return null;
            }
        }

        return ['host' => $host, 'port' => $port, 'ip' => $ips[0]];
    }

    /** True only for a genuinely public IP. Covers the IPv6 gaps PHP's range filter misses:
     *  IPv4-mapped addresses (::ffff:169.254.169.254), ULA (fc00::/7), link-local (fe80::/10). */
    private function ipIsPublic(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return false;
        }

        // Unwrap an IPv4-mapped IPv6 address and judge it as IPv4.
        if (preg_match('/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i', $ip, $m)) {
            $ip = $m[1];
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $packed = inet_pton($ip);
            $first = ord($packed[0]);
            if ($ip === '::1'                       // loopback
                || ($first & 0xFE) === 0xFC         // fc00::/7 unique-local
                || ($first === 0xFE && (ord($packed[1]) & 0xC0) === 0x80)) { // fe80::/10 link-local
                return false;
            }
        }

        return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }

    /**
     * Strips a fetched page down to plain readable text - script/style content is noise a
     * text reader doesn't need, and a hard length cap keeps the prompt (and token cost)
     * bounded regardless of page size.
     */
    public function extractReadableText(string $html): string
    {
        $html = preg_replace('#<script\b[^>]*>.*?</script>#is', ' ', $html);
        $html = preg_replace('#<style\b[^>]*>.*?</style>#is', ' ', $html);
        $text = strip_tags($html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5);
        $text = trim(preg_replace('/\s+/', ' ', $text));

        return mb_substr($text, 0, self::MAX_CHARS);
    }

    private function extractTitle(string $html): ?string
    {
        if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
            $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5));

            return $title !== '' ? mb_substr($title, 0, 200) : null;
        }

        return null;
    }

    /**
     * Pulls the description/caption text for the video hosts where the readable body is
     * useless. Best-effort: TikTok and Instagram increasingly serve a bot wall, in which
     * case there's simply nothing to extract and the caller degrades to "couldn't read it".
     */
    private function extractVideoDescription(string $url, string $html): ?string
    {
        $host = strtolower(parse_url($url, PHP_URL_HOST) ?: '');

        // YouTube: "shortDescription" in ytInitialPlayerResponse - a JSON-encoded string,
        // so decode it as one to unescape \n, \uXXXX, quotes, etc.
        if (str_contains($host, 'youtube.com') || str_contains($host, 'youtu.be')) {
            if (preg_match('/"shortDescription":"((?:[^"\\\\]|\\\\.)*)"/', $html, $m)) {
                $decoded = json_decode('"'.$m[1].'"');
                if (is_string($decoded) && trim($decoded) !== '') {
                    return mb_substr(trim($decoded), 0, self::MAX_CHARS);
                }
            }
        }

        // TikTok: "desc" inside __UNIVERSAL_DATA_FOR_REHYDRATION__ (or the older SIGI_STATE).
        if (str_contains($host, 'tiktok.com')) {
            if (preg_match('/"desc":"((?:[^"\\\\]|\\\\.)*)"/', $html, $m)) {
                $decoded = json_decode('"'.$m[1].'"');
                if (is_string($decoded) && trim($decoded) !== '') {
                    return mb_substr(trim($decoded), 0, self::MAX_CHARS);
                }
            }
        }

        // Instagram: caption lives under edge_media_to_caption.
        if (str_contains($host, 'instagram.com')) {
            if (preg_match('/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"((?:[^"\\\\]|\\\\.)*)"/', $html, $m)) {
                $decoded = json_decode('"'.$m[1].'"');
                if (is_string($decoded) && trim($decoded) !== '') {
                    return mb_substr(trim($decoded), 0, self::MAX_CHARS);
                }
            }
        }

        // og:description is a decent last resort for any host.
        if (preg_match('/<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $desc = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5));

            return $desc !== '' ? mb_substr($desc, 0, self::MAX_CHARS) : null;
        }

        return null;
    }
}
