<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Plugin;
use App\Traits\ApiResponse;
use App\Http\Requests\Plugin\StorePluginRequest;
use App\Http\Requests\Plugin\UpdatePluginRequest;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PluginController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/plugins
     * List all plugins with latest version and installed sites count.
     */
    public function index(Request $request)
    {
        $query = Plugin::with('latestVersion')
            ->withCount('sitePlugins');

        // Search by name or slug
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        // Filter by active status
        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $plugins = $query->orderBy('created_at', 'desc')->paginate(20);

        return $this->paginatedResponse($plugins);
    }

    /**
     * POST /api/plugins
     * Create a new plugin.
     */
    public function store(StorePluginRequest $request)
    {
        $data = $request->validated();

        // Auto-generate slug from name if not provided
        if (empty($data['slug'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        $data['created_by'] = $request->user()->id;

        $plugin = Plugin::create($data);

        ActivityLogService::log(
            'plugin.created',
            $plugin,
            $request->user(),
            $request->ip()
        );

        $plugin->load('latestVersion');
        $plugin->loadCount('sitePlugins');

        return $this->successResponse($plugin, 'Plugin created successfully.', 201);
    }

    /**
     * GET /api/plugins/{plugin}
     * Show plugin with versions, site count, and installed-sites breakdown.
     */
    public function show(Plugin $plugin)
    {
        $plugin->load(['versions', 'creator', 'latestVersion']);
        $plugin->loadCount('sitePlugins');

        // Per-site installation rows. Used by the "Installed Sites" tab on
        // the plugin detail page to show which sites are at which version.
        $plugin->load(['sitePlugins.site:id,name,url,status']);

        $latestStable = $plugin->versions
            ->where('is_stable', true)
            ->sortByDesc('released_at')
            ->first();
        $latestStableVersion = $latestStable?->version;

        $installedSites = $plugin->sitePlugins
            ->filter(fn ($sp) => $sp->site !== null)
            ->map(fn ($sp) => [
                'site_id'           => $sp->site->id,
                'site_name'         => $sp->site->name,
                'site_url'          => $sp->site->url,
                'site_status'       => $sp->site->status,
                'installed_version' => $sp->installed_version,
                'is_active'         => (bool) $sp->is_active,
                'last_synced_at'    => optional($sp->last_synced_at)->toIso8601String(),
                'needs_update'      => $latestStableVersion
                    && $sp->installed_version
                    && version_compare($sp->installed_version, $latestStableVersion, '<'),
            ])
            ->values();

        $plugin->setAttribute('installed_sites', $installedSites);
        $plugin->unsetRelation('sitePlugins'); // omit raw relation from payload

        return $this->successResponse($plugin);
    }

    /**
     * PUT /api/plugins/{plugin}
     * Update plugin details.
     */
    public function update(UpdatePluginRequest $request, Plugin $plugin)
    {
        $plugin->update($request->validated());

        ActivityLogService::log(
            'plugin.updated',
            $plugin,
            $request->user(),
            $request->ip()
        );

        $plugin->load('latestVersion');
        $plugin->loadCount('sitePlugins');

        return $this->successResponse($plugin, 'Plugin updated successfully.');
    }
}
