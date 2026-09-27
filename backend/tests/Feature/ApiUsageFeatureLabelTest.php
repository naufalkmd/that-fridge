<?php

namespace Tests\Feature;

use App\Models\ApiUsageLog;
use App\Models\Fridge;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ApiUsageFeatureLabelTest extends TestCase
{
    use RefreshDatabase;

    private function section(User $user): Section
    {
        $fridge = Fridge::create(['user_id' => $user->id, 'name' => 'Test Fridge']);

        return Section::create(['fridge_id' => $fridge->id, 'name' => 'General']);
    }

    public function test_scans_are_logged_under_their_feature_name_not_the_class(): void
    {
        config(['services.openrouter.key' => 'test-key']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => '[]']]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 2, 'cost' => 0.001],
        ], 200)]);
        $user = User::factory()->create(['ai_credits' => 20]);
        $section = $this->section($user);

        $this->actingAs($user)->post("/api/sections/{$section->id}/items/photo/scan", ['image' => UploadedFile::fake()->image('f.jpg')])->assertOk();
        $this->actingAs($user)->post("/api/sections/{$section->id}/items/receipt/scan", ['image' => UploadedFile::fake()->image('r.jpg')])->assertOk();

        $features = ApiUsageLog::pluck('feature')->all();
        $this->assertContains('Fridge photo scan', $features);
        $this->assertContains('Receipt scan', $features);
        $this->assertNotContains('PhotoService', $features);
        $this->assertSame($user->id, ApiUsageLog::first()->user_id);
    }

    public function test_the_migration_renames_rows_logged_under_class_names(): void
    {
        DB::table('api_usage_logs')->insert([
            ['provider' => 'openrouter', 'feature' => 'PhotoService', 'created_at' => now()],
            ['provider' => 'openrouter', 'feature' => 'Admin studio: ReceiptService', 'created_at' => now()],
        ]);

        (require database_path('migrations/2026_09_29_000004_relabel_api_usage_features.php'))->up();

        $this->assertSame(['Fridge photo scan', 'Admin studio: Receipt scan'], DB::table('api_usage_logs')->orderBy('id')->pluck('feature')->all());
    }
}
