<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\PluginVersion;
use App\Models\Site;
use App\Traits\ApiResponse;
use App\Services\ActivityLogService;
use App\Jobs\DispatchBulkDeployment;
use Illuminate\Http\Request;

class DeploymentController extends Controller
{
    use ApiResponse;

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
        ]);

        $pluginVersion = PluginVersion::with('plugin')->findOrFail($request->plugin_version_id);

        // Determine target sites
        if ($request->input('all_sites')) {
            $siteIds = Site::where('status', 'connected')->pluck('id')->toArray();
        } else {
            $siteIds = $request->site_ids;
        }

        if (empty($siteIds)) {
            return $this->errorResponse('No sites selected for deployment.', 422);
        }

        // Create deployment job
        $job = DeploymentJob::create([
            'plugin_version_id' => $pluginVersion->id,
            'initiated_by' => $request->user()->id,
            'status' => 'queued',
            'total_sites' => count($siteIds),
            'note' => $request->note,
            'created_at' => now(),
        ]);

        // Create per-site records
        foreach ($siteIds as $siteId) {
            DeploymentJobSite::create([
                'deployment_job_id' => $job->id,
                'site_id' => $siteId,
                'status' => 'pending',
            ]);
        }

        // Dispatch the bulk deployment job to the queue
        DispatchBulkDeployment::dispatch($job);

        ActivityLogService::log(
            'deployment.created',
            $job,
            $request->user(),
            $request->ip(),
            ['plugin' => $pluginVersion->plugin->name, 'version' => $pluginVersion->version, 'sites' => count($siteIds)]
        );

        return $this->successResponse(
            $job->load('pluginVersion.plugin'),
            'Deployment job created and queued.',
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
}
