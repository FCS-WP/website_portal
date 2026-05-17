<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Jobs\WpOrgPluginJob;
use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\ExternalPluginCache;
use App\Models\PluginOperationLog;
use App\Models\Site;
use App\Models\SitePlugin;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExternalPluginController extends Controller
{
    use ApiResponse;

    /**
     * GET /plugins/external/updates
     * Updates dashboard: aggregate site_plugins grouped by slug where plugin_type = 'wporg'.
     */
    public function updates(Request $request)
    {
        $query = SitePlugin::where('plugin_type', 'wporg')
            ->selectRaw('
                plugin_slug,
                MAX(plugin_name) as plugin_name,
                COUNT(*) as total_sites,
                SUM(CASE WHEN update_available = 1 THEN 1 ELSE 0 END) as needs_update_count,
                MAX(installed_version) as max_installed_version,
                MIN(installed_version) as min_installed_version,
                MAX(latest_version) as latest_version
            ')
            ->groupBy('plugin_slug');

        // Search filter
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('plugin_slug', 'like', "%{$search}%")
                  ->orWhere('plugin_name', 'like', "%{$search}%");
            });
        }

        // Status filter
        if ($request->filled('status')) {
            match ($request->input('status')) {
                'has_updates' => $query->havingRaw('needs_update_count > 0'),
                'up_to_date' => $query->havingRaw('needs_update_count = 0'),
                default => null,
            };
        }

        // Sort
        $sort = $request->input('sort', 'most_affected');
        match ($sort) {
            'name' => $query->orderBy('plugin_slug'),
            'most_affected' => $query->orderByDesc('needs_update_count'),
            default => $query->orderByDesc('needs_update_count'),
        };

        $results = $query->get();

        // Enrich with ExternalPluginCache metadata
        $slugs = $results->pluck('plugin_slug')->toArray();
        $cacheData = ExternalPluginCache::whereIn('slug', $slugs)
            ->get()
            ->keyBy('slug');

        $data = $results->map(function ($row) use ($cacheData) {
            $cache = $cacheData->get($row->plugin_slug);
            $rawName = $cache->name ?? $row->plugin_name ?? $row->plugin_slug;
            return [
                'slug' => $row->plugin_slug,
                'name' => html_entity_decode($rawName, ENT_QUOTES, 'UTF-8'),
                'total_sites' => (int) $row->total_sites,
                'needs_update_count' => (int) $row->needs_update_count,
                'latest_version' => $cache->latest_version ?? $row->latest_version,
                'min_installed_version' => $row->min_installed_version,
                'max_installed_version' => $row->max_installed_version,
                'rating' => $cache->rating ?? null,
                'active_installs' => $cache->active_installs ?? null,
                'is_abandoned' => $cache->is_abandoned ?? false,
                'last_updated_wporg' => $cache->last_updated_wporg ?? null,
                'is_on_wporg' => $cache->is_on_wporg ?? null,
            ];
        });

        // Apply abandoned filter after enrichment
        if ($request->input('status') === 'abandoned') {
            $data = $data->filter(fn($item) => $item['is_abandoned'])->values();
        }

        return $this->successResponse($data);
    }

    /**
     * GET /plugins/external/updates/{slug}/sites
     * Return all sites with this plugin installed.
     */
    public function updateSites(Request $request, string $slug)
    {
        $sites = SitePlugin::where('plugin_slug', $slug)
            ->where('plugin_type', 'wporg')
            ->with('site:id,name,url,status')
            ->get()
            ->map(function ($sp) {
                return [
                    'site_id' => $sp->site_id,
                    'site_name' => $sp->site?->name,
                    'site_url' => $sp->site?->url,
                    'site_status' => $sp->site?->status,
                    'installed_version' => $sp->installed_version,
                    'latest_version' => $sp->latest_version,
                    'update_available' => $sp->update_available,
                    'is_active' => $sp->is_active,
                    'plugin_file' => $sp->plugin_file,
                    'last_synced_at' => $sp->last_synced_at,
                ];
            });

        return $this->successResponse($sites);
    }

    /**
     * GET /plugins/external/search?q={query}&page={n}
     * Proxy search to WP.org API with local enrichment.
     */
    public function search(Request $request)
    {
        $request->validate([
            'q' => 'required|string|min:2|max:100',
            'page' => 'integer|min:1|max:50',
        ]);

        $query = $request->input('q');
        $page = $request->input('page', 1);

        try {
            $response = Http::timeout(15)->get('https://api.wordpress.org/plugins/info/1.2/', [
                'action' => 'query_plugins',
                'request[search]' => $query,
                'request[page]' => $page,
                'request[per_page]' => 20,
                'request[fields][short_description]' => true,
                'request[fields][icons]' => true,
                'request[fields][banners]' => false,
                'request[fields][sections]' => false,
                'request[fields][tested]' => true,
                'request[fields][requires]' => true,
                'request[fields][rating]' => true,
                'request[fields][active_installs]' => true,
                'request[fields][last_updated]' => true,
                'request[fields][download_link]' => true,
            ]);

            if (!$response->successful()) {
                return $this->errorResponse('Failed to query WordPress.org plugin API', 502);
            }

            $data = $response->json();
            $plugins = $data['plugins'] ?? [];

            // Enrich with local data
            $slugs = collect($plugins)->pluck('slug')->toArray();
            $installedCounts = SitePlugin::whereIn('plugin_slug', $slugs)
                ->selectRaw('plugin_slug, COUNT(*) as count')
                ->groupBy('plugin_slug')
                ->pluck('count', 'plugin_slug');

            $enriched = collect($plugins)->map(function ($plugin) use ($installedCounts) {
                $lastUpdated = $plugin['last_updated'] ?? null;
                $isAbandoned = false;
                $lastUpdatedIso = null;
                if ($lastUpdated) {
                    $parsedDate = \Carbon\Carbon::parse($lastUpdated);
                    $daysSinceUpdate = now()->diffInDays($parsedDate);
                    $isAbandoned = $daysSinceUpdate > 730;
                    $lastUpdatedIso = $parsedDate->toIso8601String();
                }

                return [
                    'slug' => $plugin['slug'],
                    'name' => html_entity_decode($plugin['name'] ?? '', ENT_QUOTES, 'UTF-8'),
                    'version' => $plugin['version'] ?? null,
                    'author' => html_entity_decode(strip_tags($plugin['author'] ?? ''), ENT_QUOTES, 'UTF-8'),
                    'short_description' => html_entity_decode($plugin['short_description'] ?? '', ENT_QUOTES, 'UTF-8'),
                    'rating' => $plugin['rating'] ?? 0,
                    'active_installs' => $plugin['active_installs'] ?? 0,
                    'tested' => $plugin['tested'] ?? null,
                    'requires' => $plugin['requires'] ?? null,
                    'last_updated' => $lastUpdatedIso,
                    'download_link' => $plugin['download_link'] ?? null,
                    'icons' => $plugin['icons'] ?? [],
                    'already_installed_count' => $installedCounts->get($plugin['slug'], 0),
                    'is_abandoned' => $isAbandoned,
                ];
            });

            return $this->successResponse($enriched, null, 200, [
                'page' => (int) ($data['info']['page'] ?? $page),
                'pages' => (int) ($data['info']['pages'] ?? 1),
                'results' => (int) ($data['info']['results'] ?? 0),
            ]);
        } catch (\Exception $e) {
            Log::error("WP.org search failed: {$e->getMessage()}");
            return $this->errorResponse('Failed to search WordPress.org plugins', 502);
        }
    }

    /**
     * GET /plugins/external/{slug}/info
     * Return full plugin details from cache or fetch from WP.org.
     */
    public function info(string $slug)
    {
        $cached = ExternalPluginCache::where('slug', $slug)->first();

        // If cache is stale (>24h) or missing, fetch fresh from WP.org
        $isStale = !$cached || !$cached->last_synced_at || $cached->last_synced_at->diffInHours(now()) > 24;

        if ($isStale) {
            try {
                $response = Http::timeout(10)->get('https://api.wordpress.org/plugins/info/1.2/', [
                    'action' => 'plugin_information',
                    'request[slug]' => $slug,
                    'request[fields][short_description]' => true,
                    'request[fields][sections]' => true,
                    'request[fields][icons]' => true,
                    'request[fields][banners]' => true,
                    'request[fields][tested]' => true,
                    'request[fields][requires]' => true,
                    'request[fields][rating]' => true,
                    'request[fields][active_installs]' => true,
                    'request[fields][last_updated]' => true,
                    'request[fields][download_link]' => true,
                    'request[fields][versions]' => true,
                ]);

                if ($response->successful() && !isset($response->json()['error'])) {
                    $wpData = $response->json();

                    $lastUpdated = $wpData['last_updated'] ?? null;
                    $isAbandoned = false;
                    if ($lastUpdated) {
                        $isAbandoned = now()->diffInDays(\Carbon\Carbon::parse($lastUpdated)) > 730;
                    }

                    $cached = ExternalPluginCache::updateOrCreate(
                        ['slug' => $slug],
                        [
                            'name' => html_entity_decode($wpData['name'] ?? $slug, ENT_QUOTES, 'UTF-8'),
                            'author' => html_entity_decode(strip_tags($wpData['author'] ?? ''), ENT_QUOTES, 'UTF-8'),
                            'latest_version' => $wpData['version'] ?? null,
                            'download_url' => $wpData['download_link'] ?? null,
                            'requires_wp' => $wpData['requires'] ?? null,
                            'tested_up_to' => $wpData['tested'] ?? null,
                            'rating' => $wpData['rating'] ?? 0,
                            'active_installs' => $wpData['active_installs'] ?? 0,
                            'last_updated_wporg' => $lastUpdated ? \Carbon\Carbon::parse($lastUpdated) : null,
                            'is_on_wporg' => true,
                            'is_abandoned' => $isAbandoned,
                            'last_synced_at' => now(),
                        ]
                    );

                    // Return full WP.org response + local enrichment
                    $installedCount = SitePlugin::where('plugin_slug', $slug)->count();

                    return $this->successResponse([
                        'slug' => $slug,
                        'name' => html_entity_decode($wpData['name'] ?? $slug, ENT_QUOTES, 'UTF-8'),
                        'version' => $wpData['version'] ?? null,
                        'author' => html_entity_decode(strip_tags($wpData['author'] ?? ''), ENT_QUOTES, 'UTF-8'),
                        'short_description' => html_entity_decode($wpData['short_description'] ?? '', ENT_QUOTES, 'UTF-8'),
                        'sections' => $wpData['sections'] ?? [],
                        'rating' => $wpData['rating'] ?? 0,
                        'active_installs' => $wpData['active_installs'] ?? 0,
                        'tested' => $wpData['tested'] ?? null,
                        'requires' => $wpData['requires'] ?? null,
                        'last_updated' => $lastUpdated,
                        'download_link' => $wpData['download_link'] ?? null,
                        'icons' => $wpData['icons'] ?? [],
                        'banners' => $wpData['banners'] ?? [],
                        'versions' => $wpData['versions'] ?? [],
                        'is_abandoned' => $isAbandoned,
                        'already_installed_count' => $installedCount,
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning("WP.org info fetch for {$slug} failed: {$e->getMessage()}");
                // Fall through to return cached if available
            }
        }

        if (!$cached) {
            return $this->errorResponse('Plugin not found', 404);
        }

        $installedCount = SitePlugin::where('plugin_slug', $slug)->count();

        return $this->successResponse([
            'slug' => $cached->slug,
            'name' => $cached->name,
            'author' => $cached->author,
            'version' => $cached->latest_version,
            'download_link' => $cached->download_url,
            'requires' => $cached->requires_wp,
            'tested' => $cached->tested_up_to,
            'rating' => $cached->rating,
            'active_installs' => $cached->active_installs,
            'last_updated' => $cached->last_updated_wporg,
            'is_on_wporg' => $cached->is_on_wporg,
            'is_abandoned' => $cached->is_abandoned,
            'already_installed_count' => $installedCount,
            'last_synced_at' => $cached->last_synced_at,
        ]);
    }

    /**
     * POST /plugins/external/install
     * Install a WP.org plugin on selected sites.
     */
    public function install(Request $request)
    {
        $request->validate([
            'slug' => 'required|string',
            'version' => 'required|string',
            'site_ids' => 'required|array|min:1',
            'site_ids.*' => 'exists:sites,id',
            'activate' => 'boolean',
        ]);

        $cached = ExternalPluginCache::where('slug', $request->slug)
            ->where('is_on_wporg', true)
            ->first();

        // If no cache entry exists, fetch from WP.org and create it
        if (!$cached) {
            $cached = $this->fetchAndCachePlugin($request->slug);
        }

        // Resolve download URL and plugin metadata
        $slug = $request->slug;
        $version = $request->version;
        $downloadUrl = null;
        $fileHash = null;
        $pluginName = $slug;

        if ($cached) {
            if ($cached->is_abandoned) {
                return $this->errorResponse('Cannot install abandoned plugin. This plugin has not been updated in over 2 years.', 422);
            }
            $downloadUrl = $cached->download_url;
            $fileHash = $cached->latest_file_hash;
            $pluginName = $cached->name ?? $slug;
        } else {
            // Fallback: construct download URL directly from slug + version
            // WP.org uses a predictable URL pattern for plugin downloads
            if (empty($slug) || empty($version)) {
                return $this->errorResponse('Plugin not found on WordPress.org and insufficient data to construct download URL.', 404);
            }
            $downloadUrl = "https://downloads.wordpress.org/plugin/{$slug}.{$version}.zip";
            Log::info("Cache miss for plugin '{$slug}', using constructed download URL: {$downloadUrl}");
        }

        // Create deployment job
        $job = DeploymentJob::create([
            'job_type' => 'wporg_install',
            'plugin_slug' => $slug,
            'plugin_name' => $pluginName,
            'target_version' => $version,
            'download_url' => $downloadUrl,
            'file_hash' => $fileHash,
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'total_sites' => count($request->site_ids),
            'created_at' => now(),
        ]);

        // Create deployment_job_sites entries
        foreach ($request->site_ids as $siteId) {
            DeploymentJobSite::create([
                'deployment_job_id' => $job->id,
                'site_id' => $siteId,
                'status' => 'pending',
            ]);
        }

        // Dispatch individual jobs
        foreach ($job->sites as $djs) {
            WpOrgPluginJob::dispatch(
                $djs->id, $djs->site_id, 'wporg_install',
                $slug, $version,
                $downloadUrl, $fileHash,
                $request->boolean('activate', true)
            )->onQueue('deployments');
        }

        return $this->successResponse(['deployment_job_id' => $job->id], 'Plugin install job created.', 201);
    }

    /**
     * POST /plugins/external/update
     * Update a WP.org plugin on selected sites.
     */
    public function update(Request $request)
    {
        $request->validate([
            'slug' => 'required|string',
            'site_ids' => 'required',
        ]);

        $cached = ExternalPluginCache::where('slug', $request->slug)
            ->where('is_on_wporg', true)
            ->first();

        // If no cache entry exists, fetch from WP.org and create it
        if (!$cached) {
            $cached = $this->fetchAndCachePlugin($request->slug);
        }

        if (!$cached) {
            return $this->errorResponse('Plugin not found on WordPress.org', 404);
        }

        // Resolve site_ids
        if ($request->site_ids === 'all') {
            $siteIds = SitePlugin::where('plugin_slug', $request->slug)
                ->where('update_available', true)
                ->pluck('site_id')
                ->toArray();
        } else {
            $siteIds = (array) $request->site_ids;
        }

        if (empty($siteIds)) {
            return $this->errorResponse('No sites require this update.', 422);
        }

        // Create deployment job
        $job = DeploymentJob::create([
            'job_type' => 'wporg_update',
            'plugin_slug' => $request->slug,
            'plugin_name' => $cached->name,
            'target_version' => $cached->latest_version,
            'download_url' => $cached->download_url,
            'file_hash' => $cached->latest_file_hash,
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'total_sites' => count($siteIds),
            'created_at' => now(),
        ]);

        foreach ($siteIds as $siteId) {
            DeploymentJobSite::create([
                'deployment_job_id' => $job->id,
                'site_id' => $siteId,
                'status' => 'pending',
            ]);
        }

        foreach ($job->sites as $djs) {
            WpOrgPluginJob::dispatch(
                $djs->id, $djs->site_id, 'wporg_update',
                $request->slug, $cached->latest_version,
                $cached->download_url, $cached->latest_file_hash
            )->onQueue('deployments');
        }

        return $this->successResponse(
            ['deployment_job_id' => $job->id, 'sites_count' => count($siteIds)],
            'Plugin update job created.',
            201
        );
    }

    /**
     * GET /sites/{site}/plugins/all
     * Return ALL plugins for this site (internal + wporg + premium).
     */
    public function sitePlugins(Site $site)
    {
        $plugins = SitePlugin::where('site_id', $site->id)
            ->with('externalPlugin:slug,name,rating,active_installs,is_abandoned,last_updated_wporg')
            ->orderBy('plugin_name')
            ->get();

        return $this->successResponse($plugins);
    }

    /**
     * POST /sites/{site}/plugins/external/activate
     * Activate an external plugin on a single site (instant operation).
     */
    public function activate(Request $request, Site $site)
    {
        $request->validate([
            'slug' => 'required|string',
            'plugin_file' => 'required|string',
        ]);

        try {
            $response = Http::timeout(30)->withHeaders([
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ])->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/plugins/external/activate', [
                'slug' => $request->slug,
                'file' => $request->plugin_file,
            ]);

            if ($response->successful() && ($response->json('success') ?? false)) {
                SitePlugin::where('site_id', $site->id)
                    ->where('plugin_slug', $request->slug)
                    ->update(['is_active' => true]);

                PluginOperationLog::create([
                    'site_id' => $site->id,
                    'plugin_slug' => $request->slug,
                    'plugin_name' => $request->input('plugin_name', $request->slug),
                    'operation' => 'activate',
                    'status' => 'success',
                    'performed_by' => auth()->id(),
                    'performed_at' => now(),
                ]);

                return $this->successResponse(['success' => true], 'Plugin activated.');
            }

            $error = $response->json('error') ?? $response->json('message') ?? 'Agent returned an error';

            PluginOperationLog::create([
                'site_id' => $site->id,
                'plugin_slug' => $request->slug,
                'plugin_name' => $request->input('plugin_name', $request->slug),
                'operation' => 'activate',
                'status' => 'failed',
                'error_message' => substr($error, 0, 500),
                'performed_by' => auth()->id(),
                'performed_at' => now(),
            ]);

            return $this->errorResponse($error, 502);
        } catch (\Exception $e) {
            Log::error("Plugin activate failed on site {$site->id}: {$e->getMessage()}");
            return $this->errorResponse('Failed to communicate with site agent.', 502);
        }
    }

    /**
     * POST /sites/{site}/plugins/external/deactivate
     * Deactivate an external plugin on a single site (instant operation).
     */
    public function deactivate(Request $request, Site $site)
    {
        $request->validate([
            'slug' => 'required|string',
            'plugin_file' => 'required|string',
        ]);

        try {
            $response = Http::timeout(30)->withHeaders([
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ])->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/plugins/external/deactivate', [
                'slug' => $request->slug,
                'file' => $request->plugin_file,
            ]);

            if ($response->successful() && ($response->json('success') ?? false)) {
                SitePlugin::where('site_id', $site->id)
                    ->where('plugin_slug', $request->slug)
                    ->update(['is_active' => false]);

                PluginOperationLog::create([
                    'site_id' => $site->id,
                    'plugin_slug' => $request->slug,
                    'plugin_name' => $request->input('plugin_name', $request->slug),
                    'operation' => 'deactivate',
                    'status' => 'success',
                    'performed_by' => auth()->id(),
                    'performed_at' => now(),
                ]);

                return $this->successResponse(['success' => true], 'Plugin deactivated.');
            }

            $error = $response->json('error') ?? $response->json('message') ?? 'Agent returned an error';

            PluginOperationLog::create([
                'site_id' => $site->id,
                'plugin_slug' => $request->slug,
                'plugin_name' => $request->input('plugin_name', $request->slug),
                'operation' => 'deactivate',
                'status' => 'failed',
                'error_message' => substr($error, 0, 500),
                'performed_by' => auth()->id(),
                'performed_at' => now(),
            ]);

            return $this->errorResponse($error, 502);
        } catch (\Exception $e) {
            Log::error("Plugin deactivate failed on site {$site->id}: {$e->getMessage()}");
            return $this->errorResponse('Failed to communicate with site agent.', 502);
        }
    }

    /**
     * POST /sites/{site}/plugins/external/uninstall
     * Uninstall an external plugin from a site.
     */
    public function uninstall(Request $request, Site $site)
    {
        $request->validate([
            'slug' => 'required|string',
            'plugin_file' => 'required|string',
            'confirmation' => 'required|string',
        ]);

        if ($request->confirmation !== $request->slug) {
            return $this->errorResponse('Confirmation does not match the plugin slug.', 422);
        }

        $sitePlugin = SitePlugin::where('site_id', $site->id)
            ->where('plugin_slug', $request->slug)
            ->first();

        // Create deployment job for uninstall
        $job = DeploymentJob::create([
            'job_type' => 'wporg_uninstall',
            'plugin_slug' => $request->slug,
            'plugin_name' => $sitePlugin->plugin_name ?? $request->slug,
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'total_sites' => 1,
            'created_at' => now(),
        ]);

        $djs = DeploymentJobSite::create([
            'deployment_job_id' => $job->id,
            'site_id' => $site->id,
            'status' => 'pending',
        ]);

        WpOrgPluginJob::dispatch(
            $djs->id, $site->id, 'wporg_uninstall',
            $request->slug, null, null, null,
            false, $request->plugin_file
        )->onQueue('deployments');

        return $this->successResponse(['deployment_job_id' => $job->id], 'Plugin uninstall job created.', 201);
    }

    /**
     * POST /sites/{site}/plugins/external/update-all
     * Update all outdated wporg plugins on a single site.
     */
    public function updateAllOnSite(Request $request, Site $site)
    {
        $outdated = SitePlugin::where('site_id', $site->id)
            ->where('plugin_type', 'wporg')
            ->where('update_available', true)
            ->get();

        if ($outdated->isEmpty()) {
            return $this->errorResponse('No outdated plugins found on this site.', 422);
        }

        // Create one deployment job
        $job = DeploymentJob::create([
            'job_type' => 'wporg_update',
            'plugin_slug' => 'bulk_update',
            'plugin_name' => "Bulk update ({$outdated->count()} plugins)",
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'total_sites' => $outdated->count(),
            'created_at' => now(),
        ]);

        foreach ($outdated as $sp) {
            $cached = ExternalPluginCache::where('slug', $sp->plugin_slug)->first();

            $djs = DeploymentJobSite::create([
                'deployment_job_id' => $job->id,
                'site_id' => $site->id,
                'status' => 'pending',
            ]);

            WpOrgPluginJob::dispatch(
                $djs->id, $site->id, 'wporg_update',
                $sp->plugin_slug,
                $cached->latest_version ?? $sp->latest_version,
                $cached->download_url ?? null,
                $cached->latest_file_hash ?? null
            )->onQueue('deployments');
        }

        return $this->successResponse(
            ['deployment_job_id' => $job->id, 'plugins_count' => $outdated->count()],
            'Bulk update job created.',
            201
        );
    }

    /**
     * Fetch plugin info from WP.org and create/update local cache.
     * Returns the cached model or null if plugin not found on WP.org.
     */
    private function fetchAndCachePlugin(string $slug): ?ExternalPluginCache
    {
        try {
            $response = Http::timeout(30)->get('https://api.wordpress.org/plugins/info/1.2/', [
                'action' => 'plugin_information',
                'request[slug]' => $slug,
                'request[fields][short_description]' => true,
                'request[fields][icons]' => true,
                'request[fields][tested]' => true,
                'request[fields][requires]' => true,
                'request[fields][rating]' => true,
                'request[fields][active_installs]' => true,
                'request[fields][last_updated]' => true,
                'request[fields][download_link]' => true,
            ]);

            if (!$response->successful()) {
                Log::warning("WP.org API request failed for '{$slug}': HTTP {$response->status()}");
                return null;
            }

            $data = $response->json();

            if (isset($data['error'])) {
                Log::warning("WP.org API error for '{$slug}': {$data['error']}");
                return null;
            }

            $wpData = $data;

            $lastUpdated = $wpData['last_updated'] ?? null;
            $isAbandoned = false;
            if ($lastUpdated) {
                $isAbandoned = now()->diffInDays(\Carbon\Carbon::parse($lastUpdated)) > 730;
            }

            return ExternalPluginCache::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => html_entity_decode($wpData['name'] ?? $slug, ENT_QUOTES, 'UTF-8'),
                    'author' => html_entity_decode(strip_tags($wpData['author'] ?? ''), ENT_QUOTES, 'UTF-8'),
                    'latest_version' => $wpData['version'] ?? null,
                    'download_url' => $wpData['download_link'] ?? null,
                    'requires_wp' => $wpData['requires'] ?? null,
                    'tested_up_to' => $wpData['tested'] ?? null,
                    'rating' => $wpData['rating'] ?? 0,
                    'active_installs' => $wpData['active_installs'] ?? 0,
                    'last_updated_wporg' => $lastUpdated ? \Carbon\Carbon::parse($lastUpdated) : null,
                    'is_on_wporg' => true,
                    'is_abandoned' => $isAbandoned,
                    'last_synced_at' => now(),
                ]
            );
        } catch (\Exception $e) {
            Log::warning("Failed to fetch plugin '{$slug}' from WP.org: {$e->getMessage()}");
            return null;
        }
    }

    /**
     * POST /admin/plugins/external/refresh-cache
     * Queue cache refresh command.
     */
    public function refreshCache()
    {
        \Illuminate\Support\Facades\Artisan::queue('plugins:sync-wporg-cache');

        return $this->successResponse(['message' => 'Cache refresh queued'], null, 202);
    }

    /**
     * GET /admin/plugins/external/cache-status
     * Return cache statistics.
     */
    public function cacheStatus()
    {
        return $this->successResponse([
            'total_slugs_cached' => ExternalPluginCache::count(),
            'wporg_count' => ExternalPluginCache::where('is_on_wporg', true)->count(),
            'not_on_wporg_count' => ExternalPluginCache::where('is_on_wporg', false)->count(),
            'abandoned_count' => ExternalPluginCache::where('is_abandoned', true)->count(),
            'last_synced_at' => ExternalPluginCache::max('last_synced_at'),
        ]);
    }
}
