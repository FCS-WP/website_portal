<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;

// Public routes
Route::post('/auth/login', [AuthController::class, 'login']);

// Plugin downloads (token-authenticated, no bearer needed)
Route::get('/plugin-downloads/{token}', [\App\Http\Controllers\Portal\PluginDownloadController::class, 'download']);

// Protected routes (authenticated + active user)
Route::middleware(['auth:sanctum', 'active'])->group(function () {
    // Auth routes (all authenticated users)
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);

    // Admin-only routes
    Route::middleware('role:admin')->group(function () {
        // Hostings
        Route::apiResource('hostings', \App\Http\Controllers\Portal\HostingController::class);
        // Users
        Route::apiResource('users', \App\Http\Controllers\Portal\UserController::class)->except(['show']);
        // Settings
        Route::get('/settings', [\App\Http\Controllers\Portal\SettingsController::class, 'index']);
        Route::put('/settings', [\App\Http\Controllers\Portal\SettingsController::class, 'update']);
        Route::post('/settings/telegram/test', [\App\Http\Controllers\Portal\SettingsController::class, 'testTelegram']);
    });

    // Admin + Dev routes
    Route::middleware('role:admin,dev')->group(function () {
        // Sites (Admin + Dev can create/update/delete)
        Route::post('/sites', [\App\Http\Controllers\Portal\SiteController::class, 'store']);
        Route::put('/sites/{site}', [\App\Http\Controllers\Portal\SiteController::class, 'update']);
        Route::delete('/sites/{site}', [\App\Http\Controllers\Portal\SiteController::class, 'destroy']);
        Route::post('/sites/{site}/regenerate-key', [\App\Http\Controllers\Portal\SiteController::class, 'regenerateKey']);

        // Plugin management (Phase 2)
        Route::apiResource('plugins', \App\Http\Controllers\Portal\PluginController::class)->except(['destroy']);

        // Plugin Versions
        Route::get('/plugins/{plugin}/versions', [\App\Http\Controllers\Portal\PluginVersionController::class, 'index']);
        Route::post('/plugins/{plugin}/versions', [\App\Http\Controllers\Portal\PluginVersionController::class, 'store']);
        Route::get('/plugin-versions/{pluginVersion}/download-url', [\App\Http\Controllers\Portal\PluginVersionController::class, 'downloadUrl']);
        Route::delete('/plugin-versions/{pluginVersion}', [\App\Http\Controllers\Portal\PluginVersionController::class, 'destroy']);

        // Site Plugins
        Route::get('/sites/{site}/plugins', [\App\Http\Controllers\Portal\SitePluginController::class, 'index']);

        // Deployments
        Route::post('/deployments', [\App\Http\Controllers\Portal\DeploymentController::class, 'store']);
        Route::get('/deployments', [\App\Http\Controllers\Portal\DeploymentController::class, 'index']);
        Route::get('/deployments/{deploymentJob}', [\App\Http\Controllers\Portal\DeploymentController::class, 'show']);
        Route::get('/deployments/{deploymentJob}/progress', [\App\Http\Controllers\Portal\DeploymentController::class, 'progress']);
        Route::post('/deployments/{deploymentJob}/retry-failed', [\App\Http\Controllers\Portal\DeploymentController::class, 'retryFailed']);
        Route::post('/deployments/{deploymentJob}/cancel', [\App\Http\Controllers\Portal\DeploymentController::class, 'cancel']);
    });

    // All authenticated users (admin, dev, mkt)
    // Read-only access for some resources

    // Dashboard stats
    Route::get('/dashboard/stats', [\App\Http\Controllers\Portal\DashboardController::class, 'stats']);

    // Sites (all users can list/view, filtered by assignment for dev/mkt)
    Route::get('/sites', [\App\Http\Controllers\Portal\SiteController::class, 'index']);
    Route::get('/sites/{site}', [\App\Http\Controllers\Portal\SiteController::class, 'show']);
    Route::get('/sites/{site}/activity', [\App\Http\Controllers\Portal\SiteController::class, 'activity']);
});
