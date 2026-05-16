<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Models\Plugin;
use App\Models\PluginVersion;
use App\Models\SitePlugin;
use App\Services\ActivityLogService;
use App\Services\SignedUrlService;
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

        // Sync company_plugins data to site_plugins table
        if ($request->has('company_plugins')) {
            $this->syncCompanyPlugins($site, $request->input('company_plugins', []));
        }

        // TODO: In Phase 3, sync orders data to orders table

        return response()->json([
            'success' => true,
            'message' => 'Ping received.',
        ]);
    }

    /**
     * Sync company plugins reported by the agent to the site_plugins table.
     */
    private function syncCompanyPlugins($site, array $companyPlugins): void
    {
        // Get slugs reported by agent
        $reportedSlugs = collect($companyPlugins)->pluck('slug')->filter()->toArray();

        // Find matching plugins in our registry
        $registeredPlugins = Plugin::whereIn('slug', $reportedSlugs)->get()->keyBy('slug');

        $syncedPluginIds = [];

        foreach ($companyPlugins as $pluginData) {
            $slug = $pluginData['slug'] ?? null;
            if (!$slug || !$registeredPlugins->has($slug)) {
                continue;
            }

            $plugin = $registeredPlugins->get($slug);

            // Calculate latest stable version
            $latestVersion = $this->getLatestStableVersion($plugin->id);

            // Upsert site_plugin record
            SitePlugin::updateOrCreate(
                [
                    'site_id' => $site->id,
                    'plugin_id' => $plugin->id,
                ],
                [
                    'installed_version' => $pluginData['version'] ?? null,
                    'latest_version' => $latestVersion,
                    'is_active' => $pluginData['is_active'] ?? ($pluginData['active'] ?? false),
                    'last_synced_at' => now(),
                ]
            );

            $syncedPluginIds[] = $plugin->id;
        }

        // Remove site_plugins that are no longer reported (plugin was uninstalled)
        $site->sitePlugins()
            ->whereNotIn('plugin_id', $syncedPluginIds)
            ->delete();
    }

    /**
     * Get the latest stable version string for a plugin.
     */
    private function getLatestStableVersion(int $pluginId): ?string
    {
        $stableVersions = PluginVersion::where('plugin_id', $pluginId)
            ->where('is_stable', true)
            ->pluck('version')
            ->toArray();

        if (empty($stableVersions)) {
            return null;
        }

        // Use version_compare to find the true max version
        usort($stableVersions, 'version_compare');

        return end($stableVersions);
    }

    /**
     * POST /api/agent/plugin-updates
     * Returns available updates for installed company plugins.
     */
    public function pluginUpdates(Request $request): JsonResponse
    {
        $request->validate([
            'installed_plugins' => 'required|array|min:1',
            'installed_plugins.*.slug' => 'required|string',
            'installed_plugins.*.version' => 'required|string',
        ]);

        $installedPlugins = $request->input('installed_plugins');
        $updates = [];

        foreach ($installedPlugins as $installed) {
            $slug = $installed['slug'];
            $installedVersion = $installed['version'];

            // Find the plugin in our registry
            $plugin = Plugin::where('slug', $slug)->where('is_active', true)->first();

            if (!$plugin) {
                continue;
            }

            // Get latest stable version
            $latestVersion = $plugin->versions()
                ->where('is_stable', true)
                ->orderByDesc('released_at')
                ->first();

            if (!$latestVersion) {
                continue;
            }

            // Only return if installed version is older
            if (version_compare($installedVersion, $latestVersion->version, '>=')) {
                continue;
            }

            // Generate signed download URL
            $signedUrl = SignedUrlService::generateDownloadUrl($latestVersion);

            // Get changelog
            $changelog = $latestVersion->changelog;
            $changelogContent = $changelog ? $changelog->content : '';

            $updates[] = [
                'slug' => $slug,
                'name' => $plugin->name,
                'new_version' => $latestVersion->version,
                'download_url' => $signedUrl['url'],
                'file_hash' => $latestVersion->file_hash,
                'changelog' => $changelogContent,
                'author' => $plugin->author ?? 'EPOS Team',
                'description' => $plugin->description ?? '',
                'released_at' => $latestVersion->released_at?->toIso8601String(),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'updates' => $updates,
            ],
        ]);
    }
}
