<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The operator's to-do list, kept in the admin panel next to the numbers it depends on. Seeded once with what is still open from
     * the repo's TO_DO.md (launch blockers first); after that the panel is the place to tick things off and add more.
     */
    public function up(): void
    {
        Schema::create('admin_todos', function (Blueprint $table) {
            $table->id();
            $table->string('title', 160);
            $table->text('details')->nullable();
            $table->string('category', 24);            // ios | android | devpost | server | verify | decision | later
            $table->string('priority', 10);            // blocker | high | normal | low
            $table->string('status', 8)->default('open'); // open | done
            $table->date('due_on')->nullable();
            $table->string('link', 255)->nullable();
            $table->timestamp('done_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'priority']);
        });

        $deadline = '2026-09-30';
        $now = now();
        $rows = [
            // ---- launch blockers ------------------------------------------------------------------------------------------
            ['ios', 'blocker', 'Check App Store Connect: what is live, in review, or waiting', 'v1.3.0 is live. v1.3.2 was submitted 2026-09-18 and its decision is unverified; v1.3.3 is in TestFlight. Confirm what is live vs in review, and whether 1.3.3 (build 30) needs submitting. The repo cannot see this.', $deadline, 'https://appstoreconnect.apple.com'],
            ['ios', 'blocker', 'Submit the new build with the new listing text', 'Paste title, subtitle, keywords, description, What\'s New and promo text from APP_STORE_COPY.md. Add the EULA (thatfridge.com/terms/) and Privacy Policy (thatfridge.com/privacy/) links. Confirm App Privacy answers are unchanged (leave Health & Fitness unticked).', $deadline, null],
            ['devpost', 'blocker', 'Devpost: project page and feature description', 'Shipaton 2026 entry. Draft is in apps/mobile/DEVPOST_DRAFT.md.', $deadline, null],
            ['devpost', 'blocker', 'Devpost: demo video (max 2:00, public)', 'Public on YouTube or Vimeo, no copyrighted music or footage.', $deadline, null],
            ['devpost', 'blocker', 'Devpost: Peace Prize impact statement', 'Household food waste to savings and environmental impact.', $deadline, null],
            ['devpost', 'blocker', 'Devpost: add the App Store URL and SUBMIT before the deadline', 'Deadline is Sep 30, 2026, 11:45pm PDT. The app must be live and approved, not just submitted. Do not call it launched publicly (TestFlight link, ProductHunt, press) before the listing is live: it risks the brand-new-app rule.', $deadline, 'https://apps.apple.com/app/thatfridge/id6806239306'],
            // ---- Android ---------------------------------------------------------------------------------------------------
            ['android', 'high', 'Set up the EAS to Play publishing service account', 'google-play.yml failed on v1.3.1 and v1.3.2 and never ran for v1.3.3. Run `eas credentials` (interactive), Android, production, Google Service Account, with a Release manager role JSON. Until then every build needs a manual .aab upload.', null, null],
            ['android', 'high', 'Finish the Google Play Payments Profile', 'pay.google.com/business/console: banking/payout and tax (W-8BEN). Probably why creating credits_100 fails.', null, 'https://pay.google.com/business/console'],
            ['android', 'high', 'Create credits_100 in Play Console and attach it in RevenueCat', 'Blocked on the Payments Profile and on closed testing clearing (running since 2026-09-16). Testers need the Closed-testing opt-in link.', null, null],
            ['android', 'high', 'Create an Android OAuth client for Google Sign-In', 'Separate from the iOS client. The button fails until it exists.', null, null],
            // ---- verify ----------------------------------------------------------------------------------------------------
            ['verify', 'high', 'Device-check the latest build and OTA', 'Cold-start twice (the second should open complete), launch in airplane mode (stay signed in), Insights, Ask Chef on the recipe form and meal plan, Quick Chat with attached context, item page, Organizer toggle, Getting Started recipe step.', null, null],
            ['verify', 'high', 'Confirm the Explore catalogue seeded on production', 'Admin, Content, Explore should list curated recipes, shared icons, 3 Machine and 3 meal-plan templates. "Sync from libraries" fixes an empty catalogue. Review the placeholder meal-plan titles and choose what to feature.', null, null],
            ['server', 'normal', 'Run `php artisan app:fill-recipe-calories` once on the server', 'Lets the model refine the stop-gap calorie estimates (the nightly sweep does 50 a day).', null, null],
            ['server', 'normal', 'Check the AI cost dashboard once real traffic arrives', 'Admin dashboard, AI providers: cost per credit should stay under about $0.01. If fal.ai prices differ, set FAL_COST_GENERATE / FAL_COST_REMBG in the production .env.', null, null],
            ['server', 'low', 'Add REVENUECAT_SECRET_API_KEY to the production .env', 'Optional: only for the credit balance display mirror. The ledger is authoritative without it. Also set up the RevenueCat Virtual Currency (AICR) and the credit packs.', null, null],
            ['server', 'low', 'After both stores\' purchases are live, detach the RevenueCat Test Store products', 'Detach `monthly` and `yearly` from the packages so the paywall serves only the real store products.', null, null],
            ['decision', 'normal', 'Decide whether to turn on OPENED_EXPIRY_ALERTS_ENABLED', 'Alerts for opened items fire on the (never later than printed) opened date. Safe to leave off; the first run after enabling may send a batch for items already opened.', null, null],
            // ---- later -----------------------------------------------------------------------------------------------------
            ['later', 'low', 'Explore phase 2: user contributions and a moderation queue', 'Decided: usernames shown, free for everyone, hand-approved at first. Needs report/block/moderation (App Store guideline 1.2). See EXPLORE_PLAN.md. Post-launch.', null, null],
            ['later', 'low', 'Credit-scheme audit', 'Check every metered endpoint against real provider cost. The AI cost dashboard now shows the numbers to audit against.', null, null],
            ['later', 'low', 'Weekly digest notification', 'The switch was removed because nothing sends a digest. Build a Sunday job before bringing it back.', null, null],
            ['later', 'low', 'Kitchen Lab: show the custom-field range filter as a friendly field', 'Custom-field filters work in drafted or hand-built Machines, but the editor shows them as raw text.', null, null],
        ];

        DB::table('admin_todos')->insert(array_map(fn ($r) => [
            'category' => $r[0], 'priority' => $r[1], 'title' => $r[2], 'details' => $r[3], 'due_on' => $r[4], 'link' => $r[5],
            'status' => 'open', 'created_at' => $now, 'updated_at' => $now,
        ], $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_todos');
    }
};
