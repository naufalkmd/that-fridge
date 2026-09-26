<?php

namespace App\Services;

use App\Models\ExploreItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Ranks Explore items for a search phrase. The catalogue is small (hundreds, at most a few thousand),
 * so scoring in PHP keeps it portable across Postgres and SQLite and lets it do what a plain LIKE
 * cannot: every word of the phrase must match something, matches in the title outrank tags outrank the
 * blurb, prefixes and plural / small typos still count ("chiken" finds "chicken"), and an exact title wins.
 */
class ExploreSearch
{
    private const TITLE_EXACT = 100;

    private const TITLE_PREFIX = 80;

    private const TITLE_CONTAINS = 55;

    private const TAG_EXACT = 70;

    private const TAG_PREFIX = 50;

    private const BLURB_WORD = 30;

    private const BLURB_CONTAINS = 15;

    private const TYPO_TITLE = 40;

    private const TYPO_TAG = 30;

    /**
     * @param  Collection<int, ExploreItem>  $items
     * @return Collection<int, ExploreItem> matches, best first
     */
    public function rank(Collection $items, string $query): Collection
    {
        $tokens = $this->tokens($query);
        if ($tokens === []) {
            return $items->values();
        }
        $phrase = implode(' ', $tokens);

        return $items
            ->map(fn (ExploreItem $item) => ['item' => $item, 'score' => $this->score($item, $tokens, $phrase)])
            ->filter(fn ($row) => $row['score'] > 0)
            ->sort(fn ($a, $b) => [$b['score'], $a['item']->position, $a['item']->title] <=> [$a['score'], $b['item']->position, $b['item']->title])
            ->map(fn ($row) => $row['item'])
            ->values();
    }

    /** @param  list<string>  $tokens */
    private function score(ExploreItem $item, array $tokens, string $phrase): int
    {
        $title = $this->tokens($item->title);
        $tags = collect($item->tags ?? [])->flatMap(fn ($t) => $this->tokens((string) $t))->unique()->values()->all();
        $blurb = $this->tokens((string) $item->blurb);
        $titleText = implode(' ', $title);
        $blurbText = implode(' ', $blurb);

        $total = 0;
        foreach ($tokens as $token) {
            $best = max(
                $this->bestAgainst($token, $title, self::TITLE_EXACT, self::TITLE_PREFIX, self::TYPO_TITLE),
                str_contains($titleText, $token) ? self::TITLE_CONTAINS : 0,
                $this->bestAgainst($token, $tags, self::TAG_EXACT, self::TAG_PREFIX, self::TYPO_TAG),
                in_array($token, $blurb, true) ? self::BLURB_WORD : 0,
                str_contains($blurbText, $token) ? self::BLURB_CONTAINS : 0,
            );
            if ($best === 0) {
                return 0; // every word must find something
            }
            $total += $best;
        }

        if ($titleText === $phrase) {
            $total += 100;
        } elseif (str_starts_with($titleText, $phrase)) {
            $total += 40;
        }

        return $total + ($item->featured ? 5 : 0);
    }

    /**
     * @param  list<string>  $words
     */
    private function bestAgainst(string $token, array $words, int $exact, int $prefix, int $typo): int
    {
        $best = 0;
        foreach ($words as $word) {
            $stem = $this->stem($word);
            if ($word === $token || $stem === $this->stem($token)) {
                return $exact;
            }
            if (str_starts_with($word, $token)) {
                $best = max($best, $prefix);
            } elseif (mb_strlen($token) >= 4 && $this->closeEnough($token, $word)) {
                $best = max($best, $typo);
            }
        }

        return $best;
    }

    /** One slip (or two on a long word) between the query word and a word we hold. */
    private function closeEnough(string $token, string $word): bool
    {
        $allowed = mb_strlen($token) >= 7 ? 2 : 1;
        if (abs(mb_strlen($token) - mb_strlen($word)) > $allowed) {
            return false;
        }

        return levenshtein(Str::ascii($token), Str::ascii($word)) <= $allowed;
    }

    /** Crude plural stripping so "eggs" finds "egg" and "tomatoes" finds "tomato". */
    private function stem(string $word): string
    {
        if (mb_strlen($word) > 4 && str_ends_with($word, 'ies')) {
            return mb_substr($word, 0, -3).'y';
        }
        if (mb_strlen($word) > 4 && str_ends_with($word, 'es')) {
            return mb_substr($word, 0, -2);
        }
        if (mb_strlen($word) > 3 && str_ends_with($word, 's')) {
            return mb_substr($word, 0, -1);
        }

        return $word;
    }

    /** @return list<string> lowercase words, punctuation removed */
    private function tokens(string $text): array
    {
        $clean = preg_replace('/[^\p{L}\p{N}]+/u', ' ', Str::lower($text)) ?? '';

        return array_values(array_filter(explode(' ', trim($clean)), fn ($w) => $w !== ''));
    }
}
