<?php

namespace App\Jobs;

use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Models\Site;
use App\Services\TelegramNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WpOrgPluginJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 120;

    public function __construct(
        private int $deploymentJobSiteId,
        private int $siteId,
        private string $jobType,      // wporg_install, wporg_update, wporg_uninstall
        private string $pluginSlug,
        private ?string $targetVersion,
        private ?string $downloadUrl,
        private ?string $fileHash,
        private bool $activate = true,
        private ?string $pluginFile = null,  // needed for activate/deactivate/uninstall
    ) {}

    public function handle(): void
    {
        $deploymentJobSite = DeploymentJobSite::find($this->deploymentJobSiteId);
        if (!$deploymentJobSite) return;

        $site = Site::find($this->siteId);
        if (!$site) {
            $deploymentJobSite->update(['status' => 'failed', 'error_message' => 'Site not found']);
            $this->checkCompletion($deploymentJobSite);
            return;
        }

        // Mark as running
        $deploymentJobSite->update(['status' => 'running', 'attempt_count' => $deploymentJobSite->attempt_count + 1]);

        try {
            $agentUrl = rtrim($site->url, '/');
            $headers = [
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ];

            $response = match ($this->jobType) {
                'wporg_install' => Http::timeout(90)->withHeaders($headers)
                    ->post("{$agentUrl}/wp-json/epos-agent/v1/plugins/external/install", [
                        'slug' => $this->pluginSlug,
                        'version' => $this->targetVersion,
                        'download_url' => $this->downloadUrl,
                        'file_hash' => $this->fileHash,
                        'activate' => $this->activate,
                    ]),
                'wporg_update' => Http::timeout(90)->withHeaders($headers)
                    ->post("{$agentUrl}/wp-json/epos-agent/v1/plugins/external/update", [
                        'slug' => $this->pluginSlug,
                        'download_url' => $this->downloadUrl,
                        'file_hash' => $this->fileHash,
                    ]),
                'wporg_uninstall' => Http::timeout(60)->withHeaders($headers)
                    ->post("{$agentUrl}/wp-json/epos-agent/v1/plugins/external/uninstall", [
                        'slug' => $this->pluginSlug,
                        'file' => $this->pluginFile,
                    ]),
                default => throw new \RuntimeException("Unknown job type: {$this->jobType}"),
            };

            if ($response->successful() && ($response->json('success') ?? false)) {
                $deploymentJobSite->update([
                    'status' => 'success',
                    'deployed_at' => now(),
                ]);

                // Update site_plugins record
                $this->updateSitePlugin($site, $response->json());
            } else {
                $error = $response->json('error') ?? $response->json('message') ?? 'Unknown error';
                $deploymentJobSite->update([
                    'status' => 'failed',
                    'error_message' => substr($error, 0, 500),
                ]);
            }
        } catch (\Exception $e) {
            Log::error("WpOrgPluginJob failed: {$e->getMessage()}", [
                'site_id' => $this->siteId,
                'plugin' => $this->pluginSlug,
                'job_type' => $this->jobType,
            ]);
            $deploymentJobSite->update([
                'status' => 'failed',
                'error_message' => substr($e->getMessage(), 0, 500),
            ]);
        }

        $this->checkCompletion($deploymentJobSite);
    }

    private function updateSitePlugin(Site $site, array $agentResponse): void
    {
        $sitePlugin = \App\Models\SitePlugin::where('site_id', $site->id)
            ->where('plugin_slug', $this->pluginSlug)
            ->first();

        if ($this->jobType === 'wporg_uninstall') {
            $sitePlugin?->delete();
        } elseif ($this->jobType === 'wporg_install') {
            \App\Models\SitePlugin::updateOrCreate(
                ['site_id' => $site->id, 'plugin_slug' => $this->pluginSlug],
                [
                    'installed_version' => $this->targetVersion,
                    'is_active' => $this->activate,
                    'plugin_file' => $agentResponse['file'] ?? $this->pluginFile,
                    'plugin_type' => 'wporg',
                    'update_available' => false,
                    'last_synced_at' => now(),
                ]
            );
        } elseif ($this->jobType === 'wporg_update') {
            $sitePlugin?->update([
                'installed_version' => $this->targetVersion,
                'update_available' => false,
                'last_synced_at' => now(),
            ]);
        }
    }

    private function checkCompletion(DeploymentJobSite $deploymentJobSite): void
    {
        $job = $deploymentJobSite->deploymentJob;
        if (!$job) return;

        $pending = $job->sites()->whereIn('status', ['pending', 'running'])->count();
        if ($pending > 0) return;

        $successCount = $job->sites()->where('status', 'success')->count();
        $failedCount = $job->sites()->where('status', 'failed')->count();

        $job->update([
            'status' => $failedCount > 0 && $successCount === 0 ? 'failed' : 'completed',
            'success_count' => $successCount,
            'failed_count' => $failedCount,
            'finished_at' => now(),
        ]);

        // Send Telegram notification
        try {
            $action = match ($job->job_type) {
                'wporg_install' => 'installed',
                'wporg_update' => 'updated',
                'wporg_uninstall' => 'uninstalled',
                default => 'processed',
            };
            $message = "Plugin {$job->plugin_name} ({$job->plugin_slug}) {$action}.\n";
            $message .= "Success: {$successCount}, Failed: {$failedCount}";
            if ($job->target_version) {
                $message = "Plugin {$job->plugin_name} {$action} to v{$job->target_version}.\n" .
                    "Success: {$successCount}/{$job->total_sites}, Failed: {$failedCount}";
            }
            TelegramNotificationService::notifyAdminChannel($message);
        } catch (\Exception $e) {
            Log::warning("Telegram notification failed: {$e->getMessage()}");
        }
    }

    public function failed(\Throwable $exception): void
    {
        $deploymentJobSite = DeploymentJobSite::find($this->deploymentJobSiteId);
        if ($deploymentJobSite) {
            $deploymentJobSite->update([
                'status' => 'failed',
                'error_message' => substr($exception->getMessage(), 0, 500),
            ]);
            $this->checkCompletion($deploymentJobSite);
        }
    }
}
