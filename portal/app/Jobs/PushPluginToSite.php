<?php

namespace App\Jobs;

use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
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
        $pluginVersion = $deploymentJob->pluginVersion;

        // Mark as running
        $djs->update(['status' => 'running', 'attempt_count' => $djs->attempt_count + 1]);

        try {
            // Generate signed download URL for the agent
            $downloadInfo = SignedUrlService::generateDownloadUrl($pluginVersion);

            // POST to the agent's install endpoint
            $response = Http::timeout(90)
                ->withHeaders([
                    'X-Agent-Key' => $site->api_secret_key,
                    'X-Site-Url' => $site->url,
                    'Accept' => 'application/json',
                ])
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/plugins/install', [
                    'plugin_slug' => $pluginVersion->plugin->slug,
                    'version' => $pluginVersion->version,
                    'download_url' => $downloadInfo['url'],
                    'file_hash' => $pluginVersion->file_hash,
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
        $pending = $deploymentJob->sites()->whereIn('status', ['pending', 'running'])->count();

        if ($pending === 0) {
            $successCount = $deploymentJob->sites()->where('status', 'success')->count();
            $failedCount = $deploymentJob->sites()->where('status', 'failed')->count();

            $status = $failedCount > 0 ? ($successCount > 0 ? 'completed' : 'failed') : 'completed';

            $deploymentJob->update([
                'status' => $status,
                'success_count' => $successCount,
                'failed_count' => $failedCount,
                'finished_at' => now(),
            ]);

            // Telegram notification
            $plugin = $deploymentJob->pluginVersion->plugin;
            $version = $deploymentJob->pluginVersion->version;
            TelegramNotificationService::notifyAdminChannel(
                "🚀 Deployment complete: *{$plugin->name}* v{$version}\n✅ {$successCount} success | ❌ {$failedCount} failed"
            );
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
