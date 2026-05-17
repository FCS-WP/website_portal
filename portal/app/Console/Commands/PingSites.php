<?php

namespace App\Console\Commands;

use App\Models\ExternalPluginCache;
use App\Models\Plugin;
use App\Models\Site;
use App\Models\Site2faSetting;
use App\Models\SitePlugin;
use App\Models\PortalSetting;
use App\Jobs\SendTelegramNotification;
use App\Services\PluginClassificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PingSites extends Command
{
    protected $signature = 'sites:ping';
    protected $description = 'Ping all active sites to check connectivity and update status';

    public function handle(): int
    {
        $sites = Site::whereNotNull('api_key_encrypted')
            ->whereIn('status', ['connected', 'pending', 'disconnected'])
            ->get();

        $this->info("Pinging {$sites->count()} sites...");

        foreach ($sites as $site) {
            try {
                $response = Http::timeout(10)
                    ->withHeaders([
                        'X-Agent-Key' => decrypt($site->api_key_encrypted),
                        'Accept' => 'application/json',
                    ])
                    ->get(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/status');

                if ($response->successful()) {
                    $data = $response->json();

                    $site->update([
                        'status' => 'connected',
                        'last_ping_at' => now(),
                        'wp_version' => $data['wp_version'] ?? null,
                        'php_version' => $data['php_version'] ?? null,
                    ]);

                    // Sync 2FA status from agent
                    if (isset($data['two_fa'])) {
                        $twoFaData = $data['two_fa'];
                        Site2faSetting::updateOrCreate(
                            ['site_id' => $site->id],
                            [
                                'enabled' => $twoFaData['enabled'] ?? false,
                                'method' => $twoFaData['method'] ?? null,
                                'wp_plugin_used' => $twoFaData['plugin'] ?? null,
                            ]
                        );
                    }

                    // Sync all plugins from agent
                    if (isset($data['all_plugins']) && is_array($data['all_plugins'])) {
                        $this->syncAllPlugins($site, $data['all_plugins']);
                    }

                    $this->line("  ✓ {$site->name} ({$site->url}) - connected");
                } else {
                    $this->handleFailedPing($site, "HTTP {$response->status()}");
                }
            } catch (\Exception $e) {
                $this->handleFailedPing($site, $e->getMessage());
            }
        }

        $this->info('Ping complete.');

        return Command::SUCCESS;
    }

    private function handleFailedPing(Site $site, string $reason): void
    {
        // Only mark as disconnected if previously connected and last successful ping was > 15 minutes ago
        if ($site->status === 'connected' && $site->last_ping_at && $site->last_ping_at->lt(now()->subMinutes(15))) {
            $site->update(['status' => 'disconnected']);
            $this->warn("  ✗ {$site->name} - DISCONNECTED ({$reason})");

            Log::warning("Site disconnected via ping", [
                'site_id' => $site->id,
                'site_name' => $site->name,
                'url' => $site->url,
                'reason' => $reason,
            ]);

            $this->sendTelegramNotification(
                "⚠️ Site Disconnected: {$site->name} ({$site->url})\nReason: {$reason}"
            );
        } else {
            $this->warn("  ✗ {$site->name} - failed ({$reason})");
        }
    }

    private function syncAllPlugins($site, array $allPlugins): void
    {
        $slugs = array_column($allPlugins, 'slug');
        $classifications = PluginClassificationService::classifyBatch($slugs);

        // Get latest versions from cache for comparison
        $cachedVersions = ExternalPluginCache::whereIn('slug', $slugs)
            ->pluck('latest_version', 'slug')
            ->toArray();

        // Get internal plugin IDs and versions
        $internalPlugins = Plugin::whereIn('slug', $slugs)
            ->with('latestVersion')
            ->get()
            ->keyBy('slug');

        $syncedSlugs = [];

        foreach ($allPlugins as $pluginData) {
            $slug = $pluginData['slug'];
            $syncedSlugs[] = $slug;
            $type = $classifications[$slug] ?? 'premium';

            // Determine latest version and plugin_id
            $latestVersion = null;
            $pluginId = null;

            if ($type === 'internal' && isset($internalPlugins[$slug])) {
                $pluginId = $internalPlugins[$slug]->id;
                $latestVersion = $internalPlugins[$slug]->latestVersion?->version;
            } elseif ($type === 'wporg') {
                $latestVersion = $cachedVersions[$slug] ?? null;
            }

            // Compute update_available
            $updateAvailable = false;
            if ($latestVersion && ($pluginData['version'] ?? null)) {
                $updateAvailable = version_compare($pluginData['version'], $latestVersion, '<');
            }

            SitePlugin::updateOrCreate(
                ['site_id' => $site->id, 'plugin_slug' => $slug],
                [
                    'plugin_id' => $pluginId,
                    'plugin_name' => $pluginData['name'] ?? null,
                    'plugin_file' => $pluginData['file'] ?? null,
                    'plugin_type' => $type,
                    'installed_version' => $pluginData['version'] ?? null,
                    'latest_version' => $latestVersion,
                    'is_active' => $pluginData['is_active'] ?? false,
                    'update_available' => $updateAvailable,
                    'last_synced_at' => now(),
                ]
            );
        }

        // Remove plugins that are no longer installed on the site
        SitePlugin::where('site_id', $site->id)
            ->whereNotIn('plugin_slug', $syncedSlugs)
            ->delete();
    }

    private function sendTelegramNotification(string $message): void
    {
        try {
            $chatId = PortalSetting::where('key', 'telegram_default_chat_id')->value('value');
            $token = PortalSetting::where('key', 'telegram_bot_token')->value('value');

            if (!empty($chatId) && !empty($token)) {
                SendTelegramNotification::dispatch($chatId, $message);
            }
        } catch (\Exception $e) {
            $this->warn("  Failed to queue Telegram notification: {$e->getMessage()}");
        }
    }
}
