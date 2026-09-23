<?php

namespace App\Observers;

use App\Support\AdminCacheKeys;
use Illuminate\Support\Facades\Cache;

/**
 * Keeps the admin panel's "new feedback" menu badge in step with every write path (the app's
 * POST /api/feedback, the panel's status toggle and note edits) without any of them having
 * to know the badge is cached.
 */
class FeedbackObserver
{
    public function created(): void
    {
        $this->forgetBadge();
    }

    public function updated(): void
    {
        $this->forgetBadge();
    }

    public function deleted(): void
    {
        $this->forgetBadge();
    }

    private function forgetBadge(): void
    {
        Cache::forget(AdminCacheKeys::FEEDBACK_BADGE);
    }
}
