<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Models\CredentialType;
use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\Plugin;
use App\Models\PluginVersion;
use App\Models\SiteCredential;
use App\Models\SitePlugin;
use App\Services\ActivityLogService;
use App\Services\CredentialEncryptionService;
use App\Services\SignedUrlService;
use App\Services\TelegramNotificationService;
use App\Services\VaultAuditService;
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

    /**
     * POST /api/agent/sync-credentials
     * Receives admin credential data from WP Agent and creates/updates vault entries.
     */
    public function syncCredentials(Request $request): JsonResponse
    {
        $request->validate([
            'credentials' => 'required|array|min:1',
            'credentials.*.wp_user_id' => 'required|integer',
            'credentials.*.username' => 'required|string',
            'credentials.*.email' => 'required|email',
            'credentials.*.password' => 'nullable|string',
            'credentials.*.display_name' => 'nullable|string',
            'credentials.*.role' => 'nullable|string',
            'sync_reason' => 'required|string|in:user_register,password_change,profile_update,manual_push,role_change',
        ]);

        $site = $request->get('_agent_site');

        // Get WordPress credential type
        $wordpressType = CredentialType::where('slug', 'wordpress')->first();
        if (!$wordpressType) {
            return response()->json(['success' => false, 'message' => 'WordPress credential type not found'], 500);
        }

        $encryptionService = app(CredentialEncryptionService::class);
        $synced = 0;
        $created = 0;
        $updated = 0;

        foreach ($request->credentials as $credData) {
            // Find existing credential by matching wp_user_id field
            $existingCredential = SiteCredential::where('site_id', $site->id)
                ->where('credential_type_id', $wordpressType->id)
                ->whereHas('fields', function ($q) use ($credData) {
                    $q->where('field_key', 'wp_user_id')
                      ->where('field_value', (string) $credData['wp_user_id']);
                })
                ->first();

            if ($existingCredential) {
                // Update existing credential fields
                $this->updateCredentialFields($existingCredential, $credData, $encryptionService);
                $updated++;
            } else {
                // Create new credential
                $credential = SiteCredential::create([
                    'site_id' => $site->id,
                    'credential_type_id' => $wordpressType->id,
                    'label' => 'WP Admin - ' . $credData['username'],
                    'created_by' => null,
                    'updated_by' => null,
                ]);

                $adminUrl = rtrim($site->url, '/') . '/wp-admin';

                $fields = [
                    ['field_key' => 'wp_user_id', 'field_label' => 'WP User ID', 'field_value' => (string) $credData['wp_user_id'], 'is_sensitive' => false, 'sort_order' => 0],
                    ['field_key' => 'username', 'field_label' => 'Username', 'field_value' => $credData['username'], 'is_sensitive' => false, 'sort_order' => 1],
                    ['field_key' => 'password', 'field_label' => 'Password', 'field_value' => !empty($credData['password']) ? $encryptionService->encrypt($credData['password']) : '', 'is_sensitive' => true, 'sort_order' => 2],
                    ['field_key' => 'email', 'field_label' => 'Email', 'field_value' => $credData['email'], 'is_sensitive' => false, 'sort_order' => 3],
                    ['field_key' => 'url', 'field_label' => 'Admin URL', 'field_value' => $adminUrl, 'is_sensitive' => false, 'sort_order' => 4],
                ];

                foreach ($fields as $field) {
                    $credential->fields()->create($field);
                }

                $created++;
            }
            $synced++;
        }

        // Audit log
        app(VaultAuditService::class)->log(
            'agent_synced',
            $site->id,
            null,
            null,
            null,
            ['sync_reason' => $request->sync_reason, 'synced' => $synced, 'created' => $created, 'updated' => $updated]
        );

        return response()->json([
            'success' => true,
            'message' => "Synced {$synced} credentials ({$created} created, {$updated} updated)",
            'data' => [
                'synced' => $synced,
                'created' => $created,
                'updated' => $updated,
            ],
        ]);
    }

    /**
     * POST /api/agent/deployment/health-report
     * Receives health check results from the agent after plugin deployment.
     */
    public function healthReport(Request $request): JsonResponse
    {
        $request->validate([
            'deployment_job_site_id' => 'required|integer',
            'plugin_slug' => 'required|string',
            'installed_version' => 'nullable|string',
            'previous_version' => 'nullable|string',
            'check_number' => 'required|integer|in:1,2',
            'status' => 'required|string|in:healthy,rolled_back',
            'checks' => 'required|array',
            'error_detail' => 'nullable|string',
            'rolled_back' => 'required|boolean',
            'rollback_success' => 'nullable|boolean',
        ]);

        $site = $request->get('_agent_site');
        $jobSite = DeploymentJobSite::where('id', $request->deployment_job_site_id)
            ->where('site_id', $site->id)
            ->first();

        if (!$jobSite) {
            return response()->json(['success' => false, 'message' => 'Deployment record not found'], 404);
        }

        // Update status
        $jobSite->update([
            'status' => $request->status,
            'health_check_results' => $request->checks,
            'rollback_version' => $request->rolled_back ? $request->previous_version : null,
            'rollback_reason' => $request->error_detail,
            'rolled_back_at' => $request->rolled_back ? now() : null,
        ]);

        // If rolled back, send Telegram alert
        if ($request->rolled_back) {
            $job = $jobSite->deploymentJob;
            $pluginName = $job->pluginVersion->plugin->name ?? $request->plugin_slug;

            TelegramNotificationService::notifyAdminChannel(
                "\xF0\x9F\x94\x84 AUTO-ROLLBACK: {$pluginName} on {$site->name}\n" .
                "Reason: {$request->error_detail}\n" .
                "Rolled back to v{$request->previous_version}\n" .
                "Action required: investigate before re-deploying"
            );

            // Log activity
            ActivityLogService::log(
                'deployment.rolled_back',
                $site,
                null,
                $request->ip(),
                [
                    'plugin_slug' => $request->plugin_slug,
                    'installed_version' => $request->installed_version,
                    'rolled_back_to' => $request->previous_version,
                    'reason' => $request->error_detail,
                ]
            );
        }

        // Update parent job stats if second check passes or rollback occurred
        if ($request->check_number === 2 || $request->rolled_back) {
            $this->updateJobCompletion($jobSite->deploymentJob);
        }

        return response()->json(['success' => true, 'message' => 'Health report received']);
    }

    /**
     * Update parent deployment job completion status.
     */
    private function updateJobCompletion(DeploymentJob $job): void
    {
        $job->refresh();
        $sites = $job->sites;

        $pending = $sites->whereIn('status', ['pending', 'running', 'success'])->count();

        if ($pending === 0) {
            $job->update([
                'status' => 'completed',
                'success_count' => $sites->where('status', 'healthy')->count(),
                'failed_count' => $sites->where('status', 'failed')->count() + $sites->where('status', 'rolled_back')->count(),
                'finished_at' => now(),
            ]);
        }
    }

    /**
     * Update credential fields for an existing synced credential.
     */
    private function updateCredentialFields(SiteCredential $credential, array $credData, CredentialEncryptionService $encryptionService): void
    {
        // Update username
        $credential->fields()->where('field_key', 'username')->update(['field_value' => $credData['username']]);

        // Update email
        $credential->fields()->where('field_key', 'email')->update(['field_value' => $credData['email']]);

        // Update password only if provided (not empty)
        if (!empty($credData['password'])) {
            $credential->fields()->where('field_key', 'password')->update([
                'field_value' => $encryptionService->encrypt($credData['password']),
            ]);
        }

        // Update label
        $credential->update([
            'label' => 'WP Admin - ' . $credData['username'],
            'updated_by' => null,
        ]);
    }
}
