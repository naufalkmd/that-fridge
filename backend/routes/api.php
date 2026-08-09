<?php

use App\Http\Controllers\AgentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\BarcodeController;
use App\Http\Controllers\ExpiryScanController;
use App\Http\Controllers\FridgeController;
use App\Http\Controllers\IngestionController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\MemoryController;
use App\Http\Controllers\NotificationEventController;
use App\Http\Controllers\NotificationPrefController;
use App\Http\Controllers\PhotoController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\RecipeController;
use App\Http\Controllers\SectionController;
use App\Http\Controllers\ShoppingItemController;
use App\Http\Controllers\UsageHistoryController;
use Illuminate\Support\Facades\Route;

// Auth routes (public)
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Protected routes (Track A - requires auth)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

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
        Route::post('/', [AgentController::class, 'send']);
        Route::get('/sessions', [AgentController::class, 'sessions']);
        Route::get('/sessions/{sessionId}', [AgentController::class, 'sessionMessages']);
        Route::delete('/sessions/{sessionId}', [AgentController::class, 'deleteSession']);
    });

    Route::post('/items/suggest-details', [AgentController::class, 'suggestItemDetails']);

    Route::get('/fridges', [FridgeController::class, 'index']);
    Route::post('/fridges', [FridgeController::class, 'store']);
    Route::get('/fridges/{fridge}', [FridgeController::class, 'show']);
    Route::patch('/fridges/{fridge}', [FridgeController::class, 'update']);
    Route::delete('/fridges/{fridge}', [FridgeController::class, 'destroy']);

    Route::post('/fridges/{fridge}/sections', [SectionController::class, 'store']);
    Route::patch('/sections/{section}', [SectionController::class, 'update']);
    Route::delete('/sections/{section}', [SectionController::class, 'destroy']);

    Route::post('/sections/{section}/items', [ItemController::class, 'store']);
    Route::patch('/items/{item}', [ItemController::class, 'update']);
    Route::delete('/items/{item}', [ItemController::class, 'destroy']);

    Route::get('/shopping-items', [ShoppingItemController::class, 'index']);
    Route::post('/shopping-items', [ShoppingItemController::class, 'store']);
    Route::patch('/shopping-items/{shoppingItem}', [ShoppingItemController::class, 'update']);
    Route::delete('/shopping-items/{shoppingItem}', [ShoppingItemController::class, 'destroy']);

    Route::get('/notification-prefs', [NotificationPrefController::class, 'show']);
    Route::patch('/notification-prefs', [NotificationPrefController::class, 'update']);

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
    Route::patch('/recipes/{recipe}', [RecipeController::class, 'update']);
    Route::delete('/recipes/{recipe}', [RecipeController::class, 'destroy']);
    Route::post('/recipes/{recipe}/favorite', [RecipeController::class, 'favorite']);
    Route::delete('/recipes/{recipe}/favorite', [RecipeController::class, 'unfavorite']);
});
