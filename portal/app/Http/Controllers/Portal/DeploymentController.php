<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\PluginVersion;
use App\Models\Site;
use App\Models\SitePlugin;
use App\Traits\ApiResponse;
use App\Traits\AuthorizesSiteAccess;
use App\Services\ActivityLogService;
use App\Jobs\DispatchBulkDeployment;
use App\Jobs\PushPluginToSite;
use Illuminate\Http\Request;

class DeploymentController extends Controller
{
    use ApiResponse;
    use AuthorizesSiteAccess;

    /**
     * POST /api/deployments
     * Create a new deployment job.
     * Body: { plugin_version_id, site_ids: [...] | all_sites: true }
     */
    public function store(Request $request)
    {
        $request->validate([
            'plugin_version_id' => 'required|exists:plugin_versions,id',
            'site_ids' => 'required_without:all_sites|array',
            'site_ids.*' => 'exists:sites,id',
            'all_sites' => 'required_without:site_ids|boolean',
            'note' => 'nullable|string|max:500',
            'scheduled_at' => 'nullable|date|after:now',
        ]);

        $pluginVersion = PluginVersion::with('plugin')->findOrFail($request->plugin_version_id);

        // Determine target sites
        if ($request->input('all_sites')) {
            $siteIds = Site::where('status', 'connected')->pluck('id')->toArray();
        } else {
            $siteIds = $request->site_ids;
        }

        // Beta track handling: filter sites based on version track
        if ($pluginVersion->track === 'beta') {
            if ($request->input('all_sites')) {
                // Auto-filter to only beta tester sites
                $siteIds = Site::where('status', 'connected')
                    ->where('is_beta_tester', true)
                    ->pluck('id')
                    ->toArray();
            } else {
                // Validate that all selected sites are beta testers
                $nonBetaSites = Site::whereIn('id', $siteIds)
                    ->where('is_beta_tester', false)
                    ->count();
                if ($nonBetaSites > 0) {
                    return $this->errorResponse('Beta versions can only be deployed to beta tester sites.', 422);
                }
            }
        }

        if (empty($siteIds)) {
            return $this->errorResponse('No sites selected for deployment.', 422);
        }

        $isScheduled = !empty($request->scheduled_at);

        // Create deployment job
        $job = DeploymentJob::create([
            'plugin_version_id' => $pluginVersion->id,
            'initiated_by' => $request->user()->id,
            'status' => $isScheduled ? 'scheduled' : 'queued',
            'total_sites' => count($siteIds),
            'note' => $request->note,
            'scheduled_at' => $isScheduled ? $request->scheduled_at : null,
            'created_at' => now(),
        ]);

        // Pre-flight: skip sites already at the target version. Pulls one
        // row per site from site_plugins (the agent's last reported state),
        // matched by plugin_id. Sites without a row fall through to a
        // normal deploy (treated as not-installed). is_active=false also
        // falls through so a deactivated plugin is re-installed and
        // re-activated by the agent.
        $alreadyInstalledSiteIds = SitePlugin::query()
            ->whereIn('site_id', $siteIds)
            ->where('plugin_id', $pluginVersion->plugin_id)
            ->where('installed_version', $pluginVersion->version)
            ->where('is_active', true)
            ->pluck('site_id')
            ->all();
        $alreadyInstalledSet = array_flip($alreadyInstalledSiteIds);

        $skippedReason = "Already at v{$pluginVersion->version}";
        foreach ($siteIds as $siteId) {
            $isSkipped = isset($alreadyInstalledSet[$siteId]);
            DeploymentJobSite::create([
                'deployment_job_id' => $job->id,
                'site_id' => $siteId,
                'status' => $isSkipped ? 'skipped' : 'pending',
                'error_message' => $isSkipped ? $skippedReason : null,
                'deployed_at' => $isSkipped ? now() : null,
            ]);
        }

        // If EVERY site was skipped, finalize the job inline — there is no
        // work for DispatchBulkDeployment to do and the completion check
        // in PushPluginToSite never fires (it only runs after a real push).
        $hasWorkToDo = count($siteIds) > count($alreadyInstalledSiteIds);

        if (!$hasWorkToDo) {
            $job->update([
                'status' => 'completed',
                'success_count' => 0,
                'failed_count' => 0,
                'finished_at' => now(),
            ]);
        } elseif (!$isScheduled) {
            DispatchBulkDeployment::dispatch($job);
        }

        ActivityLogService::log(
            'deployment.created',
            $job,
            $request->user(),
            $request->ip(),
            ['plugin' => $pluginVersion->plugin->name, 'version' => $pluginVersion->version, 'sites' => count($siteIds), 'scheduled' => $isScheduled]
        );

        $message = $isScheduled ? 'Deployment scheduled.' : 'Deployment job created and queued.';

        return $this->successResponse(
            $job->load('pluginVersion.plugin'),
            $message,
            201
        );
    }

    /**
     * GET /api/deployments
     * List deployment jobs.
     */
    public function index(Request $request)
    {
        $query = DeploymentJob::with(['pluginVersion.plugin', 'initiator:id,name'])
            ->orderBy('created_at', 'desc');

        $deployments = $query->paginate($request->input('per_page', 20));

        return $this->paginatedResponse($deployments);
    }

    /**
     * GET /api/deployments/{deploymentJob}
     * Show deployment job details with per-site statuses.
     */
    public function show(DeploymentJob $deploymentJob)
    {
        $deploymentJob->load([
            'pluginVersion.plugin',
            'pluginVersion.changelog',
            'initiator:id,name',
            'sites.site:id,name,url,status,hosting_id',
            'sites.site.hosting:id,name'
        ]);

        return $this->successResponse($deploymentJob);
    }

    /**
     * GET /api/deployments/{deploymentJob}/progress
     * Return progress counts for polling.
     */
    public function progress(DeploymentJob $deploymentJob)
    {
        $counts = DeploymentJobSite::where('deployment_job_id', $deploymentJob->id)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
            ")
            ->first();

        return $this->successResponse([
            'job_status' => $deploymentJob->status,
            'total' => (int) $counts->total,
            'success' => (int) $counts->success,
            'failed' => (int) $counts->failed,
            'pending' => (int) $counts->pending,
            'running' => (int) $counts->running,
            'skipped' => (int) $counts->skipped,
        ]);
    }

    /**
     * POST /api/deployments/{deploymentJob}/retry-failed
     * Retry all failed sites.
     */
    public function retryFailed(Request $request, DeploymentJob $deploymentJob)
    {
        if (!in_array($deploymentJob->status, ['completed', 'failed'])) {
            return $this->errorResponse('Can only retry after deployment is completed or failed.', 422);
        }

        $failedSites = $deploymentJob->sites()->where('status', 'failed')->get();

        if ($failedSites->isEmpty()) {
            return $this->errorResponse('No failed sites to retry.', 422);
        }

        // Reset failed sites to pending
        DeploymentJobSite::where('deployment_job_id', $deploymentJob->id)
            ->where('status', 'failed')
            ->update(['status' => 'pending', 'error_message' => null]);

        // Reset job counters
        $deploymentJob->update([
            'status' => 'queued',
            'failed_count' => 0,
            'finished_at' => null,
        ]);

        // Re-dispatch
        DispatchBulkDeployment::dispatch($deploymentJob);

        ActivityLogService::log(
            'deployment.retried',
            $deploymentJob,
            $request->user(),
            $request->ip(),
            ['failed_count' => $failedSites->count()]
        );

        return $this->successResponse(null, 'Retry dispatched for ' . $failedSites->count() . ' failed sites.');
    }

    /**
     * POST /api/deployments/{deploymentJob}/cancel
     * Cancel a queued or running deployment.
     */
    public function cancel(Request $request, DeploymentJob $deploymentJob)
    {
        if (!in_array($deploymentJob->status, ['queued', 'running'])) {
            return $this->errorResponse('Can only cancel queued or running deployments.', 422);
        }

        // Cancel pending sites
        DeploymentJobSite::where('deployment_job_id', $deploymentJob->id)
            ->whereIn('status', ['pending', 'running'])
            ->update(['status' => 'skipped']);

        $deploymentJob->update([
            'status' => 'cancelled',
            'finished_at' => now(),
        ]);

        ActivityLogService::log(
            'deployment.cancelled',
            $deploymentJob,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse(null, 'Deployment cancelled.');
    }

    /**
     * GET /api/deployments/scheduled
     * List scheduled deployment jobs.
     */
    public function scheduled()
    {
        $jobs = DeploymentJob::where('status', 'scheduled')
            ->with(['pluginVersion.plugin', 'initiator'])
            ->orderBy('scheduled_at')
            ->paginate(20);

        return response()->json(['data' => $jobs]);
    }

    /**
     * PUT /api/deployments/{deploymentJob}/schedule
     * Reschedule a scheduled deployment.
     */
    public function updateSchedule(Request $request, DeploymentJob $deploymentJob)
    {
        if ($deploymentJob->status !== 'scheduled') {
            return response()->json(['success' => false, 'message' => 'Can only reschedule jobs in scheduled status'], 422);
        }

        $request->validate([
            'scheduled_at' => 'required|date|after:now',
        ]);

        $deploymentJob->update(['scheduled_at' => $request->scheduled_at]);

        return response()->json([
            'success' => true,
            'message' => 'Schedule updated',
            'data' => $deploymentJob->fresh()->load('pluginVersion.plugin'),
        ]);
    }

    /**
     * DELETE /api/deployments/{deploymentJob}/schedule
     * Cancel a scheduled deployment.
     */
    public function cancelSchedule(DeploymentJob $deploymentJob)
    {
        if ($deploymentJob->status !== 'scheduled') {
            return response()->json(['success' => false, 'message' => 'Can only cancel scheduled jobs'], 422);
        }

        $deploymentJob->update([
            'status' => 'cancelled',
            'finished_at' => now(),
        ]);

        // Also mark all pending sites as skipped
        $deploymentJob->sites()->where('status', 'pending')->update(['status' => 'skipped']);

        return response()->json(['success' => true, 'message' => 'Scheduled deployment cancelled']);
    }

    /**
     * POST /api/deployment-job-sites/{deploymentJobSite}/rollback
     * Trigger a manual rollback for a specific site deployment.
     */
    public function rollbackSite(DeploymentJobSite $deploymentJobSite)
    {
        $site = $deploymentJobSite->site;
        $job = $deploymentJobSite->deploymentJob;
        $pluginVersion = $job->pluginVersion;
        $plugin = $pluginVersion->plugin;

        // Find previous stable version
        $previousVersion = PluginVersion::where('plugin_id', $plugin->id)
            ->where('id', '<', $pluginVersion->id)
            ->where('is_stable', true)
            ->orderByDesc('id')
            ->first();

        if (!$previousVersion) {
            return response()->json(['success' => false, 'message' => 'No previous version available for rollback'], 422);
        }

        // Create rollback deployment job
        $rollbackJob = DeploymentJob::create([
            'plugin_version_id' => $previousVersion->id,
            'initiated_by' => auth()->id(),
            'status' => 'queued',
            'job_type' => 'rollback',
            'total_sites' => 1,
            'success_count' => 0,
            'failed_count' => 0,
            'note' => "Manual rollback from v{$pluginVersion->version} to v{$previousVersion->version}",
            'created_at' => now(),
        ]);

        $rollbackJobSite = $rollbackJob->sites()->create([
            'site_id' => $site->id,
            'status' => 'pending',
            'attempt_count' => 0,
        ]);

        // Dispatch the rollback job
        PushPluginToSite::dispatch($rollbackJobSite);

        // Log activity
        ActivityLogService::log(
            'deployment.manual_rollback',
            $site,
            auth()->user(),
            request()->ip(),
            [
                'plugin' => $plugin->name,
                'from_version' => $pluginVersion->version,
                'to_version' => $previousVersion->version,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => "Rollback initiated: {$plugin->name} v{$previousVersion->version}",
            'data' => [
                'deployment_job_id' => $rollbackJob->id,
                'rollback_version' => $previousVersion->version,
            ],
        ]);
    }

    /**
     * GET /api/sites/{site}/rollback-history
     * Get rollback history for a site.
     */
    public function rollbackHistory(Request $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

        $history = DeploymentJobSite::where('site_id', $site->id)
            ->where(function ($q) use ($site) {
                $q->where('status', 'rolled_back')
                  ->orWhereHas('deploymentJob', fn($j) => $j->where('job_type', 'rollback'));
            })
            ->with(['deploymentJob.pluginVersion.plugin', 'site'])
            ->orderByDesc('rolled_back_at')
            ->paginate(20);

        return response()->json(['data' => $history]);
    }
}
