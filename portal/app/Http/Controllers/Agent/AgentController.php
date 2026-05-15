<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class AgentController extends Controller
{
    /**
     * POST /api/agent/handshake
     * Called by the WP Agent on activation to establish connection.
     */
    public function handshake(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');

        $request->validate([
            'wp_version' => 'nullable|string|max:20',
            'php_version' => 'nullable|string|max:20',
            'woo_active' => 'nullable|boolean',
            'company_plugins' => 'nullable|array',
            'company_plugins.*.slug' => 'string',
            'company_plugins.*.version' => 'string',
            'company_plugins.*.active' => 'boolean',
        ]);

        // Update site info
        $site->update([
            'status' => 'connected',
            'wp_version' => $request->input('wp_version'),
            'php_version' => $request->input('php_version'),
            'woo_active' => $request->input('woo_active', false),
            'last_ping_at' => now(),
        ]);

        // Log the connection
        ActivityLogService::log(
            'site.connected',
            $site,
            null, // no user — agent action
            $request->ip(),
            [
                'wp_version' => $request->input('wp_version'),
                'php_version' => $request->input('php_version'),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Handshake successful. Site is now connected.',
        ]);
    }

    /**
     * POST /api/agent/ping
     * Called periodically (every 5 min) by the WP Agent as heartbeat.
     */
    public function ping(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');

        $request->validate([
            'company_plugins' => 'nullable|array',
            'company_plugins.*.slug' => 'string',
            'company_plugins.*.version' => 'string',
            'company_plugins.*.active' => 'boolean',
            'orders' => 'nullable|array',
        ]);

        // Update last ping time
        $updateData = ['last_ping_at' => now()];

        // If site was disconnected, mark as connected (recovery)
        if ($site->status === 'disconnected') {
            $updateData['status'] = 'connected';

            ActivityLogService::log(
                'site.recovered',
                $site,
                null,
                $request->ip()
            );
        }

        $site->update($updateData);

        // TODO: In Phase 2, sync company_plugins data to site_plugins table
        // TODO: In Phase 3, sync orders data to orders table

        return response()->json([
            'success' => true,
            'message' => 'Ping received.',
        ]);
    }
}
