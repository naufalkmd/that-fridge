<?php

use App\Http\Controllers\AgentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\BadgeController;
use App\Http\Controllers\BarcodeController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ExpiryScanController;
use App\Http\Controllers\FridgeController;
use App\Http\Controllers\FridgeJoinRequestController;
use App\Http\Controllers\FridgeMemberController;
use App\Http\Controllers\FridgeNoteController;
use App\Http\Controllers\IconController;
use App\Http\Controllers\IngestionController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\MemoryController;
use App\Http\Controllers\NotificationEventController;
use App\Http\Controllers\NotificationPrefController;
use App\Http\Controllers\OrganizerTallyController;
use App\Http\Controllers\PhotoController;
use App\Http\Controllers\PushTokenController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\RecipeController;
use App\Http\Controllers\ScoreSnapshotController;
use App\Http\Controllers\SectionController;
use App\Http\Controllers\ShoppingItemController;
use App\Http\Controllers\UsageHistoryController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserGoalController;
use Illuminate\Support\Facades\Route;

// Auth routes (public)
Route::post('/auth/apple', [AuthController::class, 'apple']);
Route::post('/auth/google', [AuthController::class, 'google']);
// Rate-limited: /register and /login are brute-forceable; /forgot-password sends an
// email, /reset-password is brute-forceable too.
Route::middleware('throttle:6,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [PasswordResetController::class, 'forgot']);
    Route::post('/reset-password', [PasswordResetController::class, 'reset']);
});

// Protected routes (Track A - requires auth)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::delete('/me', [AuthController::class, 'destroy']);

    // TRACK B: Ingestion & Agents
    Route::prefix('sections/{section}')->group(function () {
        Route::post('items/manual', [IngestionController::class, 'store']);
        Route::post('items/barcode', [BarcodeController::class, 'scan']);
        Route::post('items/receipt/scan', [ReceiptController::class, 'scan']);
        Route::post('items/receipt/confirm', [ReceiptController::class, 'confirm']);
        Route::post('items/photo/scan', [PhotoController::class, 'scan']);
        Route::post('items/photo/confirm', [PhotoController::class, 'confirm']);
        Route::post('items/expiry-scan', [ExpiryScanController::class, 'scan']);
    });

    // Chat history is per-user, so it needs auth to know whose history to read/write.
    Route::prefix('chat')->group(function () {
        Route::get('/', [AgentController::class, 'history']);
        // Rate-limited: every call here hits an LLM, unlike the plain-DB-read routes below.
        // Same reasoning as /icons/generate's throttle - protects against a script hammering
        // the endpoint directly, not meant to replace the client-side weekly quota (chatQuota.ts).
        Route::middleware('throttle:15,1')->post('/', [AgentController::class, 'send']);
        Route::get('/sessions', [AgentController::class, 'sessions']);
        Route::get('/sessions/{sessionId}', [AgentController::class, 'sessionMessages']);
        Route::delete('/sessions/{sessionId}', [AgentController::class, 'deleteSession']);
    });

    Route::post('/items/suggest-details', [AgentController::class, 'suggestItemDetails']);

    Route::get('/icons/generated', [IconController::class, 'index']);
    Route::delete('/icons/generated/{generatedIcon}', [IconController::class, 'destroy']);
    // Icon generation calls fal.ai per request, so it's throttled tighter than the other
    // (free/local) rate-limited endpoint - each hit is a real, billable API call.
    Route::middleware('throttle:10,1')->post('/icons/generate', [IconController::class, 'generate']);

    Route::get('/fridges', [FridgeController::class, 'index']);
    Route::post('/fridges', [FridgeController::class, 'store']);
    Route::get('/fridges/{fridge}', [FridgeController::class, 'show']);
    Route::patch('/fridges/{fridge}', [FridgeController::class, 'update']);
    Route::delete('/fridges/{fridge}', [FridgeController::class, 'destroy']);

    Route::get('/fridges/{fridge}/members', [FridgeMemberController::class, 'index']);
    Route::delete('/fridges/{fridge}/members/{user}', [FridgeMemberController::class, 'destroy']);
    Route::post('/fridges/{fridge}/leave', [FridgeMemberController::class, 'leave']);

    Route::get('/fridges/{fridge}/join-requests', [FridgeJoinRequestController::class, 'index']);
    Route::post('/fridges/{fridge}/join-requests', [FridgeJoinRequestController::class, 'store']);
    Route::get('/fridges/{fridge}/invites', [FridgeJoinRequestController::class, 'sentInvites']);
    Route::post('/fridges/{fridge}/invites', [FridgeJoinRequestController::class, 'invite']);
    Route::get('/invites', [FridgeJoinRequestController::class, 'myInvites']);
    Route::get('/join-requests', [FridgeJoinRequestController::class, 'myRequests']);
    Route::post('/join-requests/{joinRequest}/approve', [FridgeJoinRequestController::class, 'approve']);
    Route::post('/join-requests/{joinRequest}/decline', [FridgeJoinRequestController::class, 'decline']);

    Route::get('/notes', [FridgeNoteController::class, 'index']);
    Route::post('/fridges/{fridge}/notes', [FridgeNoteController::class, 'store']);
    Route::patch('/notes/{note}', [FridgeNoteController::class, 'update']);
    Route::delete('/notes/{note}', [FridgeNoteController::class, 'destroy']);

    // Find-a-friend: search is throttled (first rate-limited endpoint in this app) since it's
    // the only user-enumeration surface - everything else requires already knowing/being a
    // member of something.
    Route::middleware('throttle:20,1')->get('/users/search', [UserController::class, 'search']);
    Route::get('/users/{user:username}/profile', [UserController::class, 'profile']);
    Route::post('/users/{user:username}/block', [BlockController::class, 'store']);
    Route::delete('/users/{user:username}/block', [BlockController::class, 'destroy']);

    Route::post('/fridges/{fridge}/sections', [SectionController::class, 'store']);
    Route::patch('/sections/{section}', [SectionController::class, 'update']);
    Route::delete('/sections/{section}', [SectionController::class, 'destroy']);

    // User-defined categories for the Inventory filter bar. Separate from nutrition_category.
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::patch('/categories/{category}', [CategoryController::class, 'update']);
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);

    Route::post('/sections/{section}/items', [ItemController::class, 'store']);
    // Must precede /items/{item} — "bulk-category" is not a route-model-bindable id.
    Route::patch('/items/bulk-category', [ItemController::class, 'bulkCategory']);
    Route::patch('/items/{item}', [ItemController::class, 'update']);
    Route::delete('/items/{item}', [ItemController::class, 'destroy']);

    Route::get('/shopping-items', [ShoppingItemController::class, 'index']);
    Route::post('/fridges/{fridge}/shopping-items', [ShoppingItemController::class, 'store']);
    Route::patch('/shopping-items/{shoppingItem}', [ShoppingItemController::class, 'update']);
    Route::delete('/shopping-items/{shoppingItem}', [ShoppingItemController::class, 'destroy']);

    Route::get('/notification-prefs', [NotificationPrefController::class, 'show']);
    Route::patch('/notification-prefs', [NotificationPrefController::class, 'update']);

    Route::post('/push-tokens', [PushTokenController::class, 'store']);
    Route::delete('/push-tokens', [PushTokenController::class, 'destroy']);

    Route::get('/user-goal', [UserGoalController::class, 'show']);
    Route::patch('/user-goal', [UserGoalController::class, 'update']);

    Route::get('/score-snapshots', [ScoreSnapshotController::class, 'index']);

    Route::get('/badges', [BadgeController::class, 'index']);
    Route::post('/badges/{badgeKey}/progress', [BadgeController::class, 'progress']);

    Route::get('/organizer-tally', [OrganizerTallyController::class, 'show']);
    Route::post('/organizer-tally/increment', [OrganizerTallyController::class, 'increment']);

    Route::get('/notification-events', [NotificationEventController::class, 'index']);
    Route::patch('/notification-events/{notificationEvent}', [NotificationEventController::class, 'update']);

    Route::get('/usage-history', [UsageHistoryController::class, 'index']);
    Route::post('/usage-history', [UsageHistoryController::class, 'store']);
    Route::delete('/usage-history', [UsageHistoryController::class, 'clear']);
    Route::delete('/usage-history/{usageHistory}', [UsageHistoryController::class, 'destroy']);

    Route::get('/memory', [MemoryController::class, 'show']);
    Route::post('/memory/extract', [MemoryController::class, 'extract']);
    Route::delete('/memory', [MemoryController::class, 'destroy']);
    Route::delete('/memory/facts/{index}', [MemoryController::class, 'destroyFact']);

    Route::get('/recipes', [RecipeController::class, 'index']);
    Route::post('/recipes', [RecipeController::class, 'store']);
    Route::get('/recipes/suggest', [RecipeController::class, 'suggest']);
    Route::post('/recipes/attachments', [RecipeController::class, 'uploadAttachment']);
    Route::post('/recipes/import-link', [RecipeController::class, 'importFromLink']);
    // After /suggest so that literal path still wins; before the {recipe} write routes.
    Route::get('/recipes/{recipe}', [RecipeController::class, 'show']);
    Route::patch('/recipes/{recipe}', [RecipeController::class, 'update']);
    Route::delete('/recipes/{recipe}', [RecipeController::class, 'destroy']);
    Route::post('/recipes/{recipe}/favorite', [RecipeController::class, 'favorite']);
    Route::delete('/recipes/{recipe}/favorite', [RecipeController::class, 'unfavorite']);
    Route::post('/recipes/{recipe}/mark-made', [RecipeController::class, 'markMade']);
});
