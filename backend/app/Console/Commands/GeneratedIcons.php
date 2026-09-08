<?php

namespace App\Console\Commands;

use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Review tool for the AI icons users have generated, so good generic ones can be hand-picked
 * into the shared pack (app:promote-icon). `--html` writes a thumbnail gallery you can open
 * in a browser - the only practical way to actually look at the images.
 */
#[Signature('app:generated-icons
    {--days=30 : Only generations from the last N days}
    {--kind= : Filter by kind (icon|recipe)}
    {--limit=200 : Max rows}
    {--promoted : Show only ones already in the shared pack}
    {--html= : Write a thumbnail gallery HTML file to this path and stop}')]
#[Description('List / preview the icons users have AI-generated, for curating the shared pack')]
class GeneratedIcons extends Command
{
    public function handle(): int
    {
        $promotedIds = SharedIcon::whereNotNull('source_generated_icon_id')
            ->pluck('source_generated_icon_id')->flip();

        $query = GeneratedIcon::query()
            ->where('created_at', '>=', Carbon::now()->subDays((int) $this->option('days')))
            ->latest()
            ->limit((int) $this->option('limit'));

        if ($kind = $this->option('kind')) {
            $query->where('kind', $kind);
        }

        $rows = $query->get(['id', 'user_id', 'kind', 'prompt', 'image_url', 'created_at']);

        if ($this->option('promoted')) {
            $rows = $rows->filter(fn ($r) => $promotedIds->has($r->id))->values();
        }

        if ($path = $this->option('html')) {
            file_put_contents($path, $this->gallery($rows, $promotedIds));
            $this->info("Wrote {$rows->count()} icons to {$path} — open it in a browser, then: php artisan app:promote-icon <id> --label=\"…\"");

            return self::SUCCESS;
        }

        if ($rows->isEmpty()) {
            $this->warn('No generations match.');

            return self::SUCCESS;
        }

        $this->table(
            ['id', 'kind', 'in pack', 'prompt', 'when', 'url'],
            $rows->map(fn ($r) => [
                $r->id,
                $r->kind,
                $promotedIds->has($r->id) ? 'yes' : '',
                mb_strimwidth($r->prompt, 0, 40, '…'),
                $r->created_at->diffForHumans(),
                $r->image_url,
            ]),
        );
        $this->line('Preview the images with --html=/tmp/icons.html');

        return self::SUCCESS;
    }

    private function gallery($rows, $promotedIds): string
    {
        $cards = $rows->map(function ($r) use ($promotedIds) {
            $tag = $promotedIds->has($r->id) ? '<span class="pill">in pack</span>' : '';
            $prompt = htmlspecialchars($r->prompt ?? '', ENT_QUOTES);
            $url = htmlspecialchars($r->image_url, ENT_QUOTES);

            return <<<HTML
                <figure>
                  <img src="{$url}" alt="{$prompt}" loading="lazy">
                  <figcaption><b>#{$r->id}</b> · {$r->kind} {$tag}<br><span>{$prompt}</span></figcaption>
                </figure>
                HTML;
        })->implode("\n");

        return <<<HTML
            <!doctype html><meta charset="utf-8"><title>Generated icons</title>
            <style>
              body{background:#0a0a0c;color:#eaeaec;font:14px system-ui;margin:24px}
              .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
              figure{margin:0;background:#131316;border:1px solid #ffffff17;border-radius:8px;padding:10px;text-align:center}
              img{width:96px;height:96px;object-fit:contain;image-rendering:pixelated;background:#1a1a1f;border-radius:6px}
              figcaption{margin-top:8px;font-size:11px;line-height:1.4}
              figcaption span{color:#9d9d9e}
              .pill{background:#26c6da22;color:#26c6da;border-radius:4px;padding:1px 5px;font-size:10px}
            </style>
            <h1>Generated icons ({$rows->count()})</h1>
            <p style="color:#9d9d9e">Promote a generic one into the shared pack:
              <code>php artisan app:promote-icon &lt;id&gt; --label="Tomato"</code></p>
            <div class="grid">
            {$cards}
            </div>
            HTML;
    }
}
