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
use App\Services\OrderIngestService;
use App\Services\SignedUrlService;
use App\Services\SitePluginIngestService;
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
            'site' => [
                'id'                => $site->id,
                'name'              => $site->name,
                'url'               => $site->url,
                'status'            => $site->status,
                'wp_version'        => $site->wp_version,
                'php_version'       => $site->php_version,
                'woo_active'        => (bool) $site->woo_active,
                'last_ping_at'      => optional($site->last_ping_at)->toIso8601String(),
                'tags'              => $site->tags,
                'portal_time'       => now()->toIso8601String(),
            ],
            // Hosts the agent should trust when validating download URLs in
            // plugin install/update requests. portal_base_url is where signed
            // download URLs are issued from (often a separate backend host),
            // and APP_URL covers the case where they're the same.
            'download_hosts' => $this->trustedDownloadHosts(),
        ]);
    }

    /**
     * Build the list of hosts the agent should trust for plugin downloads.
     * Combines the portal's APP_URL and the PortalSetting `portal_base_url`
     * (which the SignedUrlService uses to construct download links) so the
     * agent accepts both whether they're the same domain or split across
     * frontend + backend hosts in production.
     */
    private function trustedDownloadHosts(): array
    {
        $candidates = [
            config('app.url'),
            \App\Models\PortalSetting::where('key', 'portal_base_url')->value('value'),
        ];

        $hosts = [];
        foreach ($candidates as $url) {
            if (!$url) continue;
            $host = parse_url($url, PHP_URL_HOST);
            if ($host) $hosts[] = strtolower($host);
        }
        return array_values(array_unique(array_filter($hosts)));
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
            // Phase 6: full installed-plugin list (internal + wporg + premium).
            'all_plugins' => 'nullable|array',
            'all_plugins.*.slug' => 'string',
            'all_plugins.*.name' => 'nullable|string',
            'all_plugins.*.version' => 'nullable|string',
            'all_plugins.*.file' => 'nullable|string',
            'all_plugins.*.is_active' => 'nullable|boolean',
            'all_plugins.*.is_network_active' => 'nullable|boolean',
            // Phase 7: accept both the new wrapped envelope from
            // class-order-sync.php and the legacy flat list. The service
            // normalizes both shapes.
            'orders' => 'nullable|array',
            'orders.last_sync_timestamp' => 'nullable|integer',
            'orders.orders' => 'nullable|array',
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

        // Phase 6 — ingest the full plugin list with classification. When the
        // agent only sends `company_plugins` (older versions), we fall back to
        // that array so internal plugins still sync.
        $pluginsAccepted = 0;
        $allPlugins = $request->input('all_plugins');
        if (empty($allPlugins) && $request->has('company_plugins')) {
            // Adapt company_plugins shape (slug/version/active) → all_plugins shape.
            $allPlugins = collect($request->input('company_plugins', []))
                ->map(fn ($p) => [
                    'slug'      => $p['slug'] ?? null,
                    'name'      => $p['name'] ?? ($p['slug'] ?? null),
                    'version'   => $p['version'] ?? null,
                    'file'      => $p['file'] ?? null,
                    'is_active' => $p['active'] ?? false,
                ])
                ->all();
        }
        if (!empty($allPlugins)) {
            $pluginsAccepted = app(SitePluginIngestService::class)
                ->ingest($site, (array) $allPlugins);
        }

        // Phase 7 — ingest orders + spike detection.
        $ordersAccepted = 0;
        if ($request->has('orders')) {
            $ordersAccepted = app(OrderIngestService::class)
                ->ingest($site, (array) $request->input('orders', []));
        }

        return response()->json([
            'success' => true,
            'message' => 'Ping received.',
            'plugins_received_count' => $pluginsAccepted,
            'orders_received_count' => $ordersAccepted,
            // Ping responses also carry the trusted-host list so the
            // agent's epos_agent_download_hosts option auto-refreshes when
            // an admin changes portal_base_url, without needing a manual
            // re-handshake.
            'download_hosts' => $this->trustedDownloadHosts(),
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
            'credentials.*.login_url' => 'nullable|string|max:500',
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
                $this->updateCredentialFields($existingCredential, $credData, $encryptionService, $site);
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

                // Prefer the login URL provided by the agent (the agent knows
                // whether the /fcs_admin customizer is active and emits the
                // appropriate URL). Fall back to {site_url}/fcs_admin when
                // the agent didn't include it (older plugin versions).
                $adminUrl = $this->resolveAdminLoginUrl($site, $credData['login_url'] ?? null);

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

        // Sites still in intermediate states
        $inProgress = $sites->whereIn('status', ['pending', 'running'])->count();

        if ($inProgress === 0) {
            $job->update([
                'status' => 'completed',
                'success_count' => $sites->whereIn('status', ['success', 'healthy'])->count(),
                'failed_count' => $sites->whereIn('status', ['failed', 'rolled_back'])->count(),
                'finished_at' => now(),
            ]);
        }
    }

    /**
     * Update credential fields for an existing synced credential.
     */
    private function updateCredentialFields(SiteCredential $credential, array $credData, CredentialEncryptionService $encryptionService, $site = null): void
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

        // Refresh the Admin URL so older credentials migrate from the legacy
        // /wp-admin value to the agent-supplied /fcs_admin URL on next sync.
        if ($site !== null) {
            $adminUrl = $this->resolveAdminLoginUrl($site, $credData['login_url'] ?? null);
            $urlField = $credential->fields()->where('field_key', 'url')->first();
            if ($urlField) {
                $urlField->update(['field_value' => $adminUrl]);
            } else {
                $credential->fields()->create([
                    'field_key' => 'url',
                    'field_label' => 'Admin URL',
                    'field_value' => $adminUrl,
                    'is_sensitive' => false,
                    'sort_order' => 4,
                ]);
            }
        }

        // Update label
        $credential->update([
            'label' => 'WP Admin - ' . $credData['username'],
            'updated_by' => null,
        ]);
    }

    /**
     * Resolve the admin login URL for a synced WordPress credential.
     *
     * Preference order:
     *   1. The login URL provided by the agent plugin (it knows whether the
     *      /fcs_admin customizer is enabled and what the canonical URL is,
     *      including any host.docker.internal rewriting baked into get_site_url()).
     *   2. {site->url}/fcs_admin as a sensible default — every site running
     *      this agent ships the customizer enabled by default.
     */
    private function resolveAdminLoginUrl($site, ?string $agentSuppliedUrl): string
    {
        $candidate = is_string($agentSuppliedUrl) ? trim($agentSuppliedUrl) : '';
        if ($candidate !== '') {
            return $candidate;
        }

        return rtrim($site->url, '/') . '/fcs_admin';
    }
}
