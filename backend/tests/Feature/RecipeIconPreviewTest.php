<?php

namespace Tests\Feature;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\User;
use App\Support\RecipeIcons;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecipeIconPreviewTest extends TestCase
{
    use RefreshDatabase;

    private function recipe(array $over = []): Recipe
    {
        return Recipe::create(array_merge(['user_id' => null, 'name' => 'Omelette', 'minutes' => 10, 'category' => 'breakfast',
            'ingredients' => [['name' => 'Eggs', 'icon' => 'eggs']], 'steps' => ['Whisk.', 'Cook.']], $over));
    }

    public function test_the_preview_follows_the_apps_order(): void
    {
        $this->assertSame('https://cdn.test/ai.png', RecipeIcons::imageUrl($this->recipe(['icon' => 'milk', 'icon_url' => 'https://cdn.test/ai.png'])));
        $this->assertStringEndsWith('/food-icons/icon-163.png', RecipeIcons::imageUrl($this->recipe(['icon' => 'milk'])));
        $this->assertStringEndsWith('/food-icons/icon-026.png', RecipeIcons::imageUrl($this->recipe())); // first ingredient
        $this->assertNull(RecipeIcons::imageUrl($this->recipe(['name' => 'Zxqv', 'ingredients' => [['name' => 'Zxqv', 'icon' => 'generic']]]))); // initials in the app
        $this->assertSame('https://cdn.test/p.jpg', RecipeIcons::photoUrl($this->recipe(['attachments' => [['type' => 'image', 'url' => 'https://cdn.test/p.jpg']]])));
    }

    public function test_recipes_and_explore_admin_show_the_pictures(): void
    {
        config(['app.admin_emails' => ['admin@example.com']]);
        $admin = User::factory()->create(['email' => 'admin@example.com']);
        $r = $this->recipe(['attachments' => [['type' => 'image', 'url' => 'https://cdn.test/p.jpg']]]);
        ExploreItem::create(['type' => 'recipe', 'ref_id' => $r->id, 'title' => 'Omelette', 'status' => 'draft']);

        $this->actingAs($admin, 'web')->get('/admin/recipes')->assertOk()->assertSee('food-icons/icon-026.png', false);
        $this->actingAs($admin, 'web')->get('/admin/explore-items')->assertOk()->assertSee('food-icons/icon-026.png', false);
        $this->actingAs($admin, 'web')->get("/admin/recipes/{$r->id}/edit")->assertOk()->assertSee('In the app')->assertSee('cdn.test/p.jpg', false);
    }
}
