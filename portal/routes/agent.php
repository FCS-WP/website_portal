<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Agent\AgentController;
use App\Http\Controllers\Portal\AutologinController;

/*
|--------------------------------------------------------------------------
| Agent API Routes
|--------------------------------------------------------------------------
|
| These routes are used by the WP Agent plugin to communicate with the Portal.
| They use a custom AgentAuthMiddleware for authentication via X-Agent-Key header.
|
*/

Route::middleware(\App\Http\Middleware\AgentAuthMiddleware::class)->group(function () {
    Route::post('/handshake', [AgentController::class, 'handshake']);
    Route::post('/ping', [AgentController::class, 'ping']);
    Route::post('/plugin-updates', [AgentController::class, 'pluginUpdates']);
    Route::post('/verify-login-token', [AutologinController::class, 'verifyToken']);
    Route::post('/sync-credentials', [AgentController::class, 'syncCredentials']);
    Route::post('/deployment/health-report', [AgentController::class, 'healthReport']);
});
