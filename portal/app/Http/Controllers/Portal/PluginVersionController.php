<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Plugin;
use App\Models\PluginVersion;
use App\Models\PluginChangelog;
use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\Site;
use App\Traits\ApiResponse;
use App\Services\PluginPackageService;
use App\Services\SignedUrlService;
use App\Services\ActivityLogService;
use App\Services\TelegramNotificationService;
use App\Jobs\DispatchBulkDeployment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PluginVersionController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/plugins/{plugin}/versions
     * List all versions for a plugin.
     */
    public function index(Plugin $plugin)
    {
        $versions = $plugin->versions()
            ->with(['changelog', 'releasedBy:id,name'])
            ->orderBy('released_at', 'desc')
            ->get();

        return $this->successResponse($versions);
    }

    /**
     * POST /api/plugins/{plugin}/versions
     * Upload a new version (multipart form data).
     */
    public function store(Request $request, Plugin $plugin)
    {
        $request->validate([
            'file' => 'required|file|mimes:zip|max:51200', // 50MB
            'version' => 'required|string|max:50|regex:/^\d+\.\d+\.\d+$/',
            'changelog' => 'required|string',
            'type' => 'required|string|in:feature,bugfix,security,breaking,other',
            'is_stable' => 'sometimes|boolean',
            'track' => 'nullable|string|in:beta,stable',
        ]);

        // Check version uniqueness for this plugin
        $existingVersion = $plugin->versions()->where('version', $request->version)->exists();
        if ($existingVersion) {
            return $this->errorResponse("Version {$request->version} already exists for this plugin.", 422);
        }

        // Check version is greater than the latest
        $latestVersion = $plugin->versions()->orderBy('released_at', 'desc')->first();
        if ($latestVersion && version_compare($request->version, $latestVersion->version, '<=')) {
            return $this->errorResponse("Version must be greater than the current latest ({$latestVersion->version}).", 422);
        }

        // Validate WordPress plugin structure
        $validation = PluginPackageService::validate($request->file('file'));
        if (!$validation['valid']) {
            return $this->errorResponse($validation['message'], 422);
        }

        // Warn if version mismatch between form and plugin header
        $warnings = [];
        if (!empty($validation['plugin_version']) && $validation['plugin_version'] !== $request->version) {
            $warnings[] = "Note: Version in plugin header ({$validation['plugin_version']}) differs from submitted version ({$request->version}).";
        }

        // Calculate file hash
        $file = $request->file('file');
        $fileHash = hash_file('sha256', $file->getPathname());
        $fileSize = $file->getSize();

        // Store the file
        $storagePath = "plugins/{$plugin->slug}/{$request->version}/{$plugin->slug}.zip";
        Storage::disk('local')->putFileAs(
            "plugins/{$plugin->slug}/{$request->version}",
            $file,
            "{$plugin->slug}.zip"
        );

        // Create version record
        $track = $request->input('track', 'stable');
        $version = PluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => $request->version,
            'file_path' => $storagePath,
            'file_size' => $fileSize,
            'file_hash' => $fileHash,
            'is_stable' => $track === 'stable' ? $request->input('is_stable', true) : false,
            'track' => $track,
            'released_by' => $request->user()->id,
            'released_at' => now(),
        ]);

        // Create changelog
        PluginChangelog::create([
            'plugin_version_id' => $version->id,
            'content' => $request->changelog,
            'type' => $request->type,
        ]);

        // Activity log
        ActivityLogService::log(
            'plugin.version_uploaded',
            $version,
            $request->user(),
            $request->ip(),
            ['plugin_slug' => $plugin->slug, 'version' => $request->version]
        );

        // Telegram notification
        TelegramNotificationService::notifyAdminChannel(
            "📦 New plugin version: *{$plugin->name}* v{$request->version} uploaded by {$request->user()->name}."
        );

        $version->load('changelog');

        $response = $version->toArray();
        if (!empty($warnings)) {
            $response['warnings'] = $warnings;
        }

        return $this->successResponse($response, 'Plugin version uploaded successfully.', 201);
    }

    /**
     * GET /api/plugin-versions/{pluginVersion}/download-url
     * Generate a signed download URL.
     */
    public function downloadUrl(PluginVersion $pluginVersion)
    {
        $downloadInfo = SignedUrlService::generateDownloadUrl($pluginVersion);

        return response()->json([
            'success' => true,
            'data' => $downloadInfo,
        ]);
    }

    /**
     * POST /api/plugin-versions/{pluginVersion}/promote
     * Promote a beta version to stable and deploy to non-beta sites.
     */
    public function promote(PluginVersion $pluginVersion)
    {
        if ($pluginVersion->track !== 'beta') {
            return response()->json(['success' => false, 'message' => 'Only beta versions can be promoted'], 422);
        }

        // Check if any beta sites rolled back
        $betaDeployments = DeploymentJobSite::whereHas('deploymentJob', function ($q) use ($pluginVersion) {
            $q->where('plugin_version_id', $pluginVersion->id);
        })->whereHas('site', fn($q) => $q->where('is_beta_tester', true));

        $rolledBackCount = (clone $betaDeployments)->where('status', 'rolled_back')->count();
        if ($rolledBackCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "{$rolledBackCount} beta site(s) rolled back. Fix issues before promoting."
            ], 422);
        }

        // Promote
        $pluginVersion->update(['track' => 'stable', 'is_stable' => true]);

        // Find all non-beta sites with this plugin installed
        $plugin = $pluginVersion->plugin;
        $targetSites = Site::where('is_beta_tester', false)
            ->whereHas('sitePlugins', fn($q) => $q->where('plugin_slug', $plugin->slug))
            ->where('status', 'connected')
            ->pluck('id')
            ->toArray();

        if (empty($targetSites)) {
            return response()->json([
                'success' => true,
                'message' => 'Version promoted to stable. No non-beta sites to deploy to.',
                'data' => ['deployment_job_id' => null, 'sites_count' => 0],
            ]);
        }

        // Create deployment job for non-beta sites
        $job = DeploymentJob::create([
            'plugin_version_id' => $pluginVersion->id,
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'job_type' => 'deploy',
            'total_sites' => count($targetSites),
            'success_count' => 0,
            'failed_count' => 0,
            'note' => "Promoted from beta to stable",
            'created_at' => now(),
        ]);

        foreach ($targetSites as $siteId) {
            $job->sites()->create([
                'site_id' => $siteId,
                'status' => 'pending',
                'attempt_count' => 0,
            ]);
        }

        DispatchBulkDeployment::dispatch($job);

        // Telegram notification
        TelegramNotificationService::notifyAdminChannel(
            "\xF0\x9F\x9A\x80 {$plugin->name} v{$pluginVersion->version} promoted to Stable. Deploying to " . count($targetSites) . " sites."
        );

        return response()->json([
            'success' => true,
            'message' => "Promoted to stable. Deploying to " . count($targetSites) . " sites.",
            'data' => [
                'deployment_job_id' => $job->id,
                'sites_count' => count($targetSites),
            ],
        ]);
    }

    /**
     * GET /api/plugin-versions/{pluginVersion}/beta-status
     * Get beta deployment status for a version.
     */
    public function betaStatus(PluginVersion $pluginVersion)
    {
        $betaSiteDeployments = DeploymentJobSite::whereHas('deploymentJob', function ($q) use ($pluginVersion) {
            $q->where('plugin_version_id', $pluginVersion->id);
        })->whereHas('site', fn($q) => $q->where('is_beta_tester', true));

        $total = (clone $betaSiteDeployments)->count();
        $deployed = (clone $betaSiteDeployments)->whereIn('status', ['success', 'healthy'])->count();
        $healthy = (clone $betaSiteDeployments)->where('status', 'healthy')->count();
        $failed = (clone $betaSiteDeployments)->where('status', 'failed')->count();
        $rolledBack = (clone $betaSiteDeployments)->where('status', 'rolled_back')->count();

        // Days running = days since first beta deployment
        $firstDeployment = (clone $betaSiteDeployments)->orderBy('deployed_at')->first();
        $daysRunning = $firstDeployment && $firstDeployment->deployed_at
            ? now()->diffInDays($firstDeployment->deployed_at)
            : 0;

        return response()->json([
            'data' => [
                'beta_sites_total' => $total,
                'deployed' => $deployed,
                'healthy' => $healthy,
                'failed' => $failed,
                'rolled_back' => $rolledBack,
                'days_running' => $daysRunning,
            ],
        ]);
    }

    /**
     * DELETE /api/plugin-versions/{pluginVersion}
     * Admin only — delete a version.
     */
    public function destroy(Request $request, PluginVersion $pluginVersion)
    {
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Only admins can delete plugin versions.', 403);
        }

        // Delete the file from storage
        if (Storage::disk('local')->exists($pluginVersion->file_path)) {
            Storage::disk('local')->delete($pluginVersion->file_path);
        }

        $pluginSlug = $pluginVersion->plugin->slug;
        $versionStr = $pluginVersion->version;

        ActivityLogService::log(
            'plugin.version_deleted',
            $pluginVersion,
            $request->user(),
            $request->ip(),
            ['plugin_slug' => $pluginSlug, 'version' => $versionStr]
        );

        $pluginVersion->delete();

        return $this->successResponse(null, 'Plugin version deleted successfully.');
    }
}
