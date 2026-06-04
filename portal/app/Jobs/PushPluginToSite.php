<?php

namespace App\Jobs;

use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\PortalSetting;
use App\Services\SignedUrlService;
use App\Services\TelegramNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PushPluginToSite implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 120;

    public function __construct(public DeploymentJobSite $deploymentJobSite)
    {
    }

    public function handle(): void
    {
        $djs = $this->deploymentJobSite;
        $site = $djs->site;
        $deploymentJob = $djs->deploymentJob;

        // Safety guard: WP.org jobs should be handled by WpOrgPluginJob, not here
        if ($deploymentJob->isWporgJob()) {
            Log::warning("PushPluginToSite received a WP.org job (type: {$deploymentJob->job_type}), skipping. Should use WpOrgPluginJob.");
            return;
        }

        $pluginVersion = $deploymentJob->pluginVersion;

        if (!$pluginVersion) {
            Log::error("PushPluginToSite: No PluginVersion found for deployment job #{$deploymentJob->id}");
            $djs->update([
                'status' => 'failed',
                'error_message' => 'No plugin version associated with this deployment job.',
            ]);
            $this->checkDeploymentCompletion($deploymentJob);
            return;
        }

        // Mark as running
        $djs->update(['status' => 'running', 'attempt_count' => $djs->attempt_count + 1]);

        try {
            // Generate signed download URL for the agent
            $downloadInfo = SignedUrlService::generateDownloadUrl($pluginVersion);

            // POST to the agent's install endpoint
            $response = Http::timeout(90)
                ->withHeaders([
                    'X-Agent-Key' => decrypt($site->api_key_encrypted),
                    'X-Site-Url' => $site->url,
                    'Accept' => 'application/json',
                ])
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/plugin/install', [
                    'plugin_slug' => $pluginVersion->plugin->slug,
                    'version' => $pluginVersion->version,
                    'download_url' => $downloadInfo['url'],
                    'file_hash' => $pluginVersion->file_hash,
                    'deployment_job_site_id' => $djs->id,
                    'health_check_delay' => (int) (PortalSetting::where('key', 'rollback_check_delay_minutes')->value('value') ?? 2),
                    'health_check_second_delay' => (int) (PortalSetting::where('key', 'rollback_second_check_delay_minutes')->value('value') ?? 5),
                    'rollback_enabled' => (bool) (PortalSetting::where('key', 'rollback_enabled')->value('value') ?? true),
                ]);

            if ($response->successful()) {
                $djs->update([
                    'status' => 'success',
                    'deployed_at' => now(),
                ]);
            } else {
                throw new \Exception('Agent returned ' . $response->status() . ': ' . $response->body());
            }
        } catch (\Exception $e) {
            Log::error("PushPluginToSite failed for site {$site->id}: " . $e->getMessage());

            $djs->update([
                'status' => 'failed',
                'error_message' => substr($e->getMessage(), 0, 500),
            ]);
        }

        // Check if all sites are done and update the deployment job
        $this->checkDeploymentCompletion($deploymentJob);
    }

    /**
     * Check if all sites in a deployment job are done, and update the job status.
     */
    protected function checkDeploymentCompletion(DeploymentJob $deploymentJob): void
    {
        $deploymentJob->refresh();
        $sites = $deploymentJob->sites;

        // Sites that are still in-progress
        $inProgress = $sites->whereIn('status', ['pending', 'running'])->count();

        if ($inProgress === 0) {
            // All sites have reported back
            $successCount = $sites->whereIn('status', ['success', 'healthy'])->count();
            $failedCount = $sites->whereIn('status', ['failed', 'rolled_back'])->count();
            $skippedCount = $sites->where('status', 'skipped')->count();

            $deploymentJob->update([
                'status' => 'completed',
                'success_count' => $successCount,
                'failed_count' => $failedCount,
                'finished_at' => now(),
            ]);

            // Telegram notification
            $pluginVersion = $deploymentJob->pluginVersion;
            if ($pluginVersion && $pluginVersion->plugin) {
                $plugin = $pluginVersion->plugin;
                $version = $pluginVersion->version;
                $skippedSuffix = $skippedCount > 0 ? " | ⏭ {$skippedCount} skipped (already at v{$version})" : '';
                TelegramNotificationService::notifyAdminChannel(
                    "🚀 Deployment complete: *{$plugin->name}* v{$version}\n✅ {$successCount} success | ❌ {$failedCount} failed{$skippedSuffix}"
                );
            }
        }
    }

    public function failed(\Throwable $exception): void
    {
        $this->deploymentJobSite->update([
            'status' => 'failed',
            'error_message' => substr($exception->getMessage(), 0, 500),
        ]);

        $this->checkDeploymentCompletion($this->deploymentJobSite->deploymentJob);
    }
}
