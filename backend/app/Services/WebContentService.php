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

    /**
     * @return array{ok: bool, text: string, title: ?string, reason: ?string}
     */
    public function fetch(string $url): array
    {
        if (! $this->isSafeUrl($url)) {
            return ['ok' => false, 'text' => '', 'title' => null, 'reason' => 'unsafe_url'];
        }

        try {
            // Redirects are rejected outright rather than followed-and-revalidated - the
            // simplest way to keep the SSRF check meaningful (a redirect could otherwise
            // point straight at an internal address after the check already passed).
            $response = Http::withOptions(['allow_redirects' => false])
                ->timeout(self::TIMEOUT_SECONDS)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; ThatFridgeBot/1.0; +https://thatfridge.com)',
                    'Accept' => 'text/html,application/xhtml+xml',
                ])
                ->get($url);

            if (! $response->successful()) {
                return ['ok' => false, 'text' => '', 'title' => null, 'reason' => 'fetch_failed'];
            }

            $html = $response->body();
            $title = $this->extractTitle($html);
            $videoText = $this->extractVideoDescription($url, $html);
            $bodyText = $this->extractReadableText($html);

            $text = trim(implode("\n\n", array_filter([
                $title ? "Page title: {$title}" : null,
                $videoText ? "Video description / caption:\n{$videoText}" : null,
                $bodyText,
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
        } catch (\Exception $e) {
            Log::warning('Web fetch failed', ['url' => $url, 'error' => $e->getMessage()]);

            return ['ok' => false, 'text' => '', 'title' => null, 'reason' => 'exception'];
        }
    }

    /**
     * Blocks the classic SSRF targets (localhost, cloud metadata endpoints, internal/private
     * networks) by resolving the host and rejecting anything outside the public IP space,
     * on top of only allowing http/https to begin with.
     */
    public function isSafeUrl(string $url): bool
    {
        $parts = parse_url($url);

        if (! $parts || ! in_array($parts['scheme'] ?? null, ['http', 'https'], true) || empty($parts['host'])) {
            return false;
        }

        $host = $parts['host'];
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);

        // gethostbyname() returns the input unchanged when resolution fails.
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return false;
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
