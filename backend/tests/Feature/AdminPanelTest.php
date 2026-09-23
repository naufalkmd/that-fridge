<?php

namespace Tests\Feature;

use App\Models\Feedback;
use App\Models\Fridge;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        config(['app.admin_emails' => ['admin@example.com']]);

        return User::factory()->create(['email' => 'Admin@Example.com']);
    }

    public function test_guest_is_redirected_to_admin_login(): void
    {
        $this->get('/admin')->assertRedirect('/admin/login');
    }

    public function test_app_user_not_in_admin_emails_is_forbidden(): void
    {
        config(['app.admin_emails' => ['admin@example.com']]);
        $user = User::factory()->create(['email' => 'someone@example.com']);

        $this->actingAs($user)->get('/admin')->assertForbidden();
    }

    public function test_admin_can_open_every_resource_page(): void
    {
        $admin = $this->admin();
        // Owned by someone else, so this also proves app policies don't hide it from admins.
        $fridge = Fridge::create(['user_id' => User::factory()->create()->id, 'name' => 'Home']);
        $item = Item::create(['section_id' => $fridge->sections()->create(['name' => 'Top'])->id, 'name' => 'Milk', 'icon' => 'milk']);
        $recipe = Recipe::create(['name' => 'Omelet', 'minutes' => 10, 'ingredients' => [['icon' => 'eggs', 'name' => 'Eggs']], 'steps' => ['Whisk.']]);

        $feedback = Feedback::create(['user_id' => $admin->id, 'email' => 'a@b.c', 'message' => 'Love it']);

        $this->actingAs($admin);

        foreach ([
            '/admin',
            '/admin/users',
            "/admin/users/{$admin->id}",
            "/admin/users/{$admin->id}/edit",
            '/admin/fridges',
            "/admin/fridges/{$fridge->id}",
            '/admin/items',
            "/admin/items/{$item->id}",
            '/admin/products',
            '/admin/products/create',
            '/admin/recipes',
            "/admin/recipes/{$recipe->id}/edit",
            '/admin/feedback',
            "/admin/feedback/{$feedback->id}",
            "/admin/feedback/{$feedback->id}/edit",
            '/admin/blocks',
            '/admin/fridge-join-requests',
            '/admin/categories',
            '/admin/shared-icons',
            '/admin/generated-icons',
            '/admin/admin-audit-logs',
            '/admin/analytics-events',
            '/admin/failed-jobs',
        ] as $url) {
            $this->assertSame(200, $this->get($url)->status(), $url);
        }
    }
}
