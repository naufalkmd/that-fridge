<?php

namespace Tests\Feature;

use App\Filament\Resources\ServiceNoticeResource\Pages\CreateServiceNotice;
use App\Filament\Resources\ServiceNoticeResource\Pages\EditServiceNotice;
use App\Jobs\SendServiceNoticeEmail;
use App\Mail\ServiceNoticeMail;
use App\Models\AdminAuditLog;
use App\Models\ApiUsageLog;
use App\Models\ServiceNotice;
use App\Models\ServiceNoticeDelivery;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Livewire\Livewire;
use Tests\TestCase;

class ServiceNoticeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        config(['app.admin_emails' => ['admin@example.com'], 'app.notice_sender_emails' => []]);
        $this->admin = User::factory()->create(['email' => 'admin@example.com']);
        $this->actingAs($this->admin);
    }

    private function draft(array $attributes = []): ServiceNotice
    {
        return ServiceNotice::create($attributes + ['subject' => 'AI is back', 'body' => "Hi there,\n\nIt's fixed now."]);
    }

    private function failedCallFor(User $user, ?\DateTimeInterface $at = null): void
    {
        ApiUsageLog::forceCreate(['provider' => 'openrouter', 'feature' => 'Quick Chat', 'user_id' => $user->id, 'ok' => false, 'reason' => 'forbidden', 'created_at' => $at ?? now()]);
    }

    // ---- who gets it ----------------------------------------------------------------------------

    public function test_all_users_means_real_users_and_never_demo_accounts(): void
    {
        $real = User::factory()->create();
        User::factory()->create(['is_demo' => true]);

        $emails = $this->draft()->recipients()->pluck('email')->all();

        $this->assertEqualsCanonicalizing([$this->admin->email, $real->email], $emails);
    }

    public function test_the_failed_ai_call_audience_is_only_the_users_it_happened_to_in_the_window(): void
    {
        $hit = User::factory()->create();
        $hitEarlier = User::factory()->create();
        $fine = User::factory()->create();
        $this->failedCallFor($hit, now()->subDay());
        $this->failedCallFor($hitEarlier, now()->subMonth());
        ApiUsageLog::forceCreate(['provider' => 'openrouter', 'feature' => 'Quick Chat', 'user_id' => $fine->id, 'ok' => true]);

        $everyone = $this->draft(['audience' => 'ai_failed']);
        $thisWeek = $this->draft(['audience' => 'ai_failed', 'audience_from' => now()->subWeek(), 'audience_until' => now()]);

        $this->assertEqualsCanonicalizing([$hit->email, $hitEarlier->email], $everyone->recipients()->pluck('email')->all());
        $this->assertSame([$hit->email], $thisWeek->recipients()->pluck('email')->all());
    }

    // ---- sending --------------------------------------------------------------------------------

    public function test_sending_emails_each_recipient_once_from_support_and_freezes_the_notice(): void
    {
        $users = User::factory()->count(2)->create();
        $notice = $this->draft();

        $this->assertSame(3, $notice->send('admin@example.com')); // the two users and the admin

        Mail::assertSentCount(3);
        foreach ($users as $user) {
            Mail::assertSent(ServiceNoticeMail::class, fn ($mail) => $mail->hasTo($user->email) && $mail->hasFrom('support@thatfridge.com') && $mail->subjectLine === 'AI is back');
        }
        $notice->refresh();
        $this->assertSame('sent', $notice->status);
        $this->assertSame(3, $notice->recipient_count);
        $this->assertSame(['sent' => 3, 'failed' => 0, 'queued' => 0], $notice->progress());

        // A second send, and re-running a delivery's job, send nothing more.
        $this->assertSame(0, $notice->send('admin@example.com'));
        (new SendServiceNoticeEmail($notice->deliveries()->value('id')))->handle();
        Mail::assertSentCount(3);
    }

    public function test_a_delivery_that_runs_out_of_retries_is_recorded_and_can_be_retried(): void
    {
        $notice = $this->draft();
        $notice->forceFill(['status' => 'sending', 'recipient_count' => 1])->save();
        $delivery = ServiceNoticeDelivery::create(['service_notice_id' => $notice->id, 'user_id' => $this->admin->id, 'email' => $this->admin->email, 'status' => 'queued']);

        (new SendServiceNoticeEmail($delivery->id))->failed(new \RuntimeException('Daily sending quota exceeded'));

        $this->assertSame('failed', $delivery->fresh()->status);
        $this->assertSame('Daily sending quota exceeded', $delivery->fresh()->error);
        $this->assertSame('sent', $notice->fresh()->status); // nothing left waiting
        Mail::assertNothingSent();

        $this->assertTrue($notice->fresh()->hasUnsent());
        $this->assertSame(1, $notice->fresh()->retryUnsent());

        Mail::assertSentCount(1);
        $this->assertSame('sent', $delivery->fresh()->status);
        $this->assertNull($delivery->fresh()->error);
        $this->assertFalse($notice->fresh()->hasUnsent());
    }

    public function test_a_delivery_the_queue_lost_can_be_retried_once_it_has_waited_half_an_hour(): void
    {
        $notice = $this->draft();
        $notice->forceFill(['status' => 'sending', 'recipient_count' => 1])->save();
        $delivery = ServiceNoticeDelivery::create(['service_notice_id' => $notice->id, 'user_id' => $this->admin->id, 'email' => $this->admin->email, 'status' => 'queued']);

        $this->assertFalse($notice->hasUnsent()); // only just queued: still on its way

        $this->travel(31)->minutes();
        $this->assertTrue($notice->hasUnsent());

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->callAction('retryUnsent')
            ->assertHasNoActionErrors();

        Mail::assertSentCount(1);
        $this->assertSame('sent', $delivery->fresh()->status);
        $this->assertSame('sent', $notice->fresh()->status);
    }

    public function test_the_email_body_keeps_its_paragraphs_and_escapes_html(): void
    {
        $html = (new ServiceNoticeMail('Subject', "Hi there,\n\nIt's <b>fixed</b> now."))->render();

        $this->assertStringContainsString('Hi there,</p>', $html);
        $this->assertStringContainsString('&lt;b&gt;fixed&lt;/b&gt;', $html);
    }

    // ---- the admin page -------------------------------------------------------------------------

    public function test_an_admin_can_open_the_pages(): void
    {
        $draft = $this->draft();

        $this->get('/admin/service-notices')->assertOk()->assertSee('AI is back');
        $this->get('/admin/service-notices/create')->assertOk();
        $this->get("/admin/service-notices/{$draft->id}/edit")->assertOk()->assertSee('Send to users');
    }

    public function test_writing_a_notice_saves_a_draft_and_sends_nothing(): void
    {
        Livewire::test(CreateServiceNotice::class)
            ->fillForm(['subject' => 'Heads up', 'body' => 'Maintenance tonight.', 'audience' => 'all'])
            ->call('create')
            ->assertHasNoFormErrors();

        $notice = ServiceNotice::sole();
        $this->assertSame('draft', $notice->status);
        Mail::assertNothingSent();
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'created', 'subject_type' => 'ServiceNotice', 'subject_id' => $notice->id]);
    }

    public function test_send_test_goes_only_to_the_admin_with_the_text_on_screen(): void
    {
        User::factory()->create();
        $notice = $this->draft();

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->fillForm(['subject' => 'Edited but not saved yet'])
            ->callAction('sendTest')
            ->assertHasNoActionErrors();

        Mail::assertSentCount(1);
        Mail::assertSent(ServiceNoticeMail::class, fn ($mail) => $mail->hasTo('admin@example.com') && $mail->subjectLine === 'Edited but not saved yet');
        $this->assertSame('draft', $notice->fresh()->status);
        $this->assertSame(0, ServiceNoticeDelivery::count());
    }

    public function test_sending_needs_the_recipient_count_typed_in(): void
    {
        User::factory()->count(2)->create();
        $notice = $this->draft();

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->callAction('send', data: ['confirm' => '2']); // there are 3

        Mail::assertNothingSent();
        $this->assertSame('draft', $notice->fresh()->status);
    }

    public function test_sending_from_the_page_emails_everyone_and_is_audited(): void
    {
        User::factory()->count(2)->create();
        $notice = $this->draft();

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->fillForm(['subject' => 'Final subject'])
            ->callAction('send', data: ['confirm' => '3'])
            ->assertHasNoActionErrors();

        Mail::assertSentCount(3);
        Mail::assertSent(ServiceNoticeMail::class, fn ($mail) => $mail->subjectLine === 'Final subject');
        $notice->refresh();
        $this->assertSame('sent', $notice->status);
        $this->assertSame('admin@example.com', $notice->sent_by_email);
        $log = AdminAuditLog::where('action', 'notice_sent')->sole();
        $this->assertSame(3, $log->changes['recipients']);
        $this->assertSame($notice->id, $log->subject_id);
    }

    public function test_a_sent_notice_cannot_be_sent_edited_or_deleted(): void
    {
        $notice = $this->draft();
        $notice->send('admin@example.com');
        Mail::assertSentCount(1);

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->assertActionHidden('send')
            ->assertActionHidden('delete')
            ->assertFormFieldIsDisabled('subject')
            ->assertFormFieldIsDisabled('body');
    }

    public function test_only_listed_senders_can_send_when_the_list_is_set(): void
    {
        config(['app.notice_sender_emails' => ['owner@example.com']]);
        $notice = $this->draft();

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->assertActionHidden('send')
            ->assertActionVisible('sendTest');

        config(['app.notice_sender_emails' => ['admin@example.com']]);

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])->assertActionVisible('send');
    }

    public function test_the_recipient_list_and_the_preview_open(): void
    {
        $user = User::factory()->create(['email' => 'zoe@example.com']);
        $notice = $this->draft();

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->mountAction('recipients')->assertSee('zoe@example.com')->assertSee('2 people');

        Livewire::test(EditServiceNotice::class, ['record' => $notice->getRouteKey()])
            ->mountAction('preview')->assertSee('Subject: AI is back');
    }

    public function test_the_one_off_outage_command_is_gone(): void
    {
        $this->assertArrayNotHasKey('app:email-ai-outage-notice', Artisan::all());
    }
}
