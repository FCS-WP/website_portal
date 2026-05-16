<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Portal\CredentialShareController;

// Public routes
Route::post('/auth/login', [AuthController::class, 'login']);

// Plugin downloads (token-authenticated, no bearer needed)
Route::get('/plugin-downloads/{token}', [\App\Http\Controllers\Portal\PluginDownloadController::class, 'download']);

// Public share link access (no authentication)
Route::get('vault/share/{token}', [CredentialShareController::class, 'show']);
Route::post('vault/share/{token}/access', [CredentialShareController::class, 'access']);

// Protected routes (authenticated + active user)
Route::middleware(['auth:sanctum', 'active'])->group(function () {
    // Auth routes (all authenticated users)
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);

    // Vault PIN
    Route::prefix('auth/vault-pin')->group(function () {
        Route::post('/setup', [\App\Http\Controllers\Portal\VaultPinController::class, 'setup']);
        Route::post('/change', [\App\Http\Controllers\Portal\VaultPinController::class, 'change']);
        Route::post('/verify', [\App\Http\Controllers\Portal\VaultPinController::class, 'verify']);
    });

    // Admin-only routes
    Route::middleware('role:admin')->group(function () {
        // Credential share links
        Route::post('sites/{site}/credentials/share', [CredentialShareController::class, 'store']);
        Route::get('sites/{site}/credentials/share-links', [CredentialShareController::class, 'index']);
        Route::delete('sites/{site}/credentials/share-links/{link}', [CredentialShareController::class, 'destroy']);

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
        Route::post('/sites/{id}/restore', [\App\Http\Controllers\Portal\SiteController::class, 'restore']);
        Route::post('/sites/{site}/toggle-beta', [\App\Http\Controllers\Portal\SiteController::class, 'toggleBetaTester']);

        // Plugin management (Phase 2)
        Route::apiResource('plugins', \App\Http\Controllers\Portal\PluginController::class)->except(['destroy']);

        // Plugin Versions
        Route::get('/plugins/{plugin}/versions', [\App\Http\Controllers\Portal\PluginVersionController::class, 'index']);
        Route::post('/plugins/{plugin}/versions', [\App\Http\Controllers\Portal\PluginVersionController::class, 'store']);
        Route::get('/plugin-versions/{pluginVersion}/download-url', [\App\Http\Controllers\Portal\PluginVersionController::class, 'downloadUrl']);
        Route::delete('/plugin-versions/{pluginVersion}', [\App\Http\Controllers\Portal\PluginVersionController::class, 'destroy']);
        Route::post('/plugin-versions/{pluginVersion}/promote', [\App\Http\Controllers\Portal\PluginVersionController::class, 'promote']);
        Route::get('/plugin-versions/{pluginVersion}/beta-status', [\App\Http\Controllers\Portal\PluginVersionController::class, 'betaStatus']);

        // Site Plugins
        Route::get('/sites/{site}/plugins', [\App\Http\Controllers\Portal\SitePluginController::class, 'index']);

        // Deployments
        Route::post('/deployments', [\App\Http\Controllers\Portal\DeploymentController::class, 'store']);
        Route::get('/deployments', [\App\Http\Controllers\Portal\DeploymentController::class, 'index']);
        Route::get('/deployments/scheduled', [\App\Http\Controllers\Portal\DeploymentController::class, 'scheduled']);
        Route::get('/deployments/{deploymentJob}', [\App\Http\Controllers\Portal\DeploymentController::class, 'show']);
        Route::get('/deployments/{deploymentJob}/progress', [\App\Http\Controllers\Portal\DeploymentController::class, 'progress']);
        Route::post('/deployments/{deploymentJob}/retry-failed', [\App\Http\Controllers\Portal\DeploymentController::class, 'retryFailed']);
        Route::post('/deployments/{deploymentJob}/cancel', [\App\Http\Controllers\Portal\DeploymentController::class, 'cancel']);
        Route::put('/deployments/{deploymentJob}/schedule', [\App\Http\Controllers\Portal\DeploymentController::class, 'updateSchedule']);
        Route::delete('/deployments/{deploymentJob}/schedule', [\App\Http\Controllers\Portal\DeploymentController::class, 'cancelSchedule']);

        // Rollback
        Route::post('/deployment-job-sites/{deploymentJobSite}/rollback', [\App\Http\Controllers\Portal\DeploymentController::class, 'rollbackSite']);
        Route::get('/sites/{site}/rollback-history', [\App\Http\Controllers\Portal\DeploymentController::class, 'rollbackHistory']);
    });

    // All authenticated users (admin, dev, mkt)
    // Read-only access for some resources

    // Dashboard stats
    Route::get('/dashboard/stats', [\App\Http\Controllers\Portal\DashboardController::class, 'stats']);

    // Sites (all users can list/view, filtered by assignment for dev/mkt)
    Route::get('/sites', [\App\Http\Controllers\Portal\SiteController::class, 'index']);
    Route::get('/sites/{site}', [\App\Http\Controllers\Portal\SiteController::class, 'show']);
    Route::get('/sites/{site}/activity', [\App\Http\Controllers\Portal\SiteController::class, 'activity']);

    // Credential types (all authenticated users)
    Route::get('/credential-types', function () {
        return response()->json(['data' => \App\Models\CredentialType::orderBy('sort_order')->get()]);
    });

    // Credentials (role-based access handled in controller)
    Route::apiResource('sites.credentials', \App\Http\Controllers\Portal\CredentialController::class);

    // Vault reveal/copy (rate limited)
    Route::post('sites/{site}/credentials/{credential}/reveal', [\App\Http\Controllers\Portal\CredentialController::class, 'reveal'])
        ->middleware('throttle:10,1');
    Route::post('sites/{site}/credentials/{credential}/copy', [\App\Http\Controllers\Portal\CredentialController::class, 'copy'])
        ->middleware('throttle:10,1');

    // Vault audit logs
    Route::get('sites/{site}/vault-logs', [\App\Http\Controllers\Portal\VaultLogController::class, 'index']);

    // Autologin (quick WP Admin access)
    Route::post('sites/{site}/autologin', [\App\Http\Controllers\Portal\AutologinController::class, 'create']);
});
