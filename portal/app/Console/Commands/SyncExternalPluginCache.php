<?php

namespace App\Console\Commands;

use App\Models\ExternalPluginCache;
use App\Models\SitePlugin;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncExternalPluginCache extends Command
{
    protected $signature = 'plugins:sync-wporg-cache {--slug= : Sync specific plugin slug}';
    protected $description = 'Sync WordPress.org plugin metadata cache for all known external plugins';

    public function handle(): int
    {
        $this->info('Starting WP.org plugin cache sync...');

        // Get unique slugs to sync
        if ($slug = $this->option('slug')) {
            $slugs = collect([$slug]);
        } else {
            $slugs = SitePlugin::where('plugin_type', '!=', 'internal')
                ->whereNotNull('plugin_slug')
                ->distinct()
                ->pluck('plugin_slug');
        }

        $this->info("Found {$slugs->count()} unique plugin slugs to sync.");

        $synced = 0;
        $failed = 0;
        $notFound = 0;

        $bar = $this->output->createProgressBar($slugs->count());
        $bar->start();

        foreach ($slugs as $pluginSlug) {
            try {
                $result = $this->syncPlugin($pluginSlug);
                if ($result === 'synced') {
                    $synced++;
                } elseif ($result === 'not_found') {
                    $notFound++;
                } else {
                    $failed++;
                }
            } catch (\Exception $e) {
                $failed++;
                Log::warning("WP.org cache sync failed for {$pluginSlug}: {$e->getMessage()}");
            }

            $bar->advance();

            // 200ms delay to avoid rate limiting
            usleep(200000);
        }

        $bar->finish();
        $this->newLine(2);

        // Reclassify site plugins based on fresh cache data
        $this->reclassifySitePlugins();

        // After cache refresh, update site_plugins
        $this->updateSitePluginVersions();

        // Detect abandoned plugins
        $this->detectAbandonedPlugins();

        $this->info("Sync complete: {$synced} synced, {$notFound} not on WP.org, {$failed} failed.");

        return self::SUCCESS;
    }

    private function syncPlugin(string $slug): string
    {
        // Query WP.org Plugins API
        $response = Http::timeout(15)->get('https://api.wordpress.org/plugins/info/1.2/', [
            'action' => 'plugin_information',
            'request[slug]' => $slug,
            'request[fields][versions]' => false,
            'request[fields][sections]' => false,
            'request[fields][description]' => false,
            'request[fields][short_description]' => false,
            'request[fields][screenshots]' => false,
            'request[fields][tags]' => false,
            'request[fields][contributors]' => false,
            'request[fields][donate_link]' => false,
        ]);

        if ($response->status() === 404 || ($response->ok() && $response->json('error'))) {
            // Plugin not found on WP.org — mark as premium
            ExternalPluginCache::updateOrCreate(
                ['slug' => $slug],
                [
                    'is_on_wporg' => false,
                    'last_synced_at' => now(),
                ]
            );
            return 'not_found';
        }

        if (!$response->ok()) {
            return 'failed';
        }

        $data = $response->json();
        if (!$data || !isset($data['slug'])) {
            return 'failed';
        }

        // Build download URL for latest version
        $latestVersion = $data['version'] ?? null;
        $downloadUrl = $data['download_link'] ?? null;
        if (!$downloadUrl && $latestVersion) {
            $downloadUrl = "https://downloads.wordpress.org/plugin/{$slug}.{$latestVersion}.zip";
        }

        // Parse last_updated (WP.org returns "2024-01-15 10:30am GMT")
        $lastUpdated = null;
        if (!empty($data['last_updated'])) {
            try {
                $lastUpdated = \Carbon\Carbon::parse($data['last_updated']);
            } catch (\Exception $e) {
                // Ignore parse errors
            }
        }

        ExternalPluginCache::updateOrCreate(
            ['slug' => $slug],
            [
                'name' => $data['name'] ?? null,
                'author' => strip_tags($data['author'] ?? ''),
                'latest_version' => $latestVersion,
                'download_url' => $downloadUrl,
                'requires_wp' => $data['requires'] ?? null,
                'tested_up_to' => $data['tested'] ?? null,
                'rating' => isset($data['rating']) ? round($data['rating'] / 20, 2) : null, // WP.org returns 0-100, convert to 0-5
                'active_installs' => isset($data['active_installs']) ? $this->formatInstalls($data['active_installs']) : null,
                'last_updated_wporg' => $lastUpdated,
                'is_on_wporg' => true,
                'is_abandoned' => $lastUpdated ? $lastUpdated->diffInDays(now()) > 730 : false,
                'last_synced_at' => now(),
            ]
        );

        return 'synced';
    }

    /**
     * After cache refresh, update site_plugins with latest versions using proper version_compare
     */
    private function updateSitePluginVersions(): void
    {
        $this->info('Updating site plugin versions from cache...');

        $cache = ExternalPluginCache::where('is_on_wporg', true)
            ->whereNotNull('latest_version')
            ->pluck('latest_version', 'slug')
            ->toArray();

        $updated = 0;

        SitePlugin::where('plugin_type', 'wporg')
            ->whereNotNull('plugin_slug')
            ->chunk(500, function ($sitePlugins) use ($cache, &$updated) {
                foreach ($sitePlugins as $sp) {
                    $latest = $cache[$sp->plugin_slug] ?? null;
                    if ($latest) {
                        $updateAvailable = $sp->installed_version
                            ? version_compare($sp->installed_version, $latest, '<')
                            : false;
                        $sp->update([
                            'latest_version' => $latest,
                            'update_available' => $updateAvailable,
                        ]);
                        $updated++;
                    }
                }
            });

        $this->info("Updated {$updated} site plugin records.");
    }

    /**
     * Reclassify site plugins: premium → wporg if cache confirms they're on WP.org
     */
    private function reclassifySitePlugins(): void
    {
        $this->info('Reclassifying site plugins based on cache...');

        $wporgSlugs = ExternalPluginCache::where('is_on_wporg', true)
            ->pluck('slug')
            ->toArray();

        if (empty($wporgSlugs)) {
            return;
        }

        // Update plugins currently marked as 'premium' that are actually on WP.org
        $reclassified = SitePlugin::where('plugin_type', 'premium')
            ->whereIn('plugin_slug', $wporgSlugs)
            ->update(['plugin_type' => 'wporg']);

        if ($reclassified > 0) {
            $this->info("Reclassified {$reclassified} site plugin records from 'premium' to 'wporg'.");
        }
    }

    /**
     * Detect and flag abandoned plugins
     */
    private function detectAbandonedPlugins(): void
    {
        $abandoned = ExternalPluginCache::where('is_on_wporg', true)
            ->whereNotNull('last_updated_wporg')
            ->where('last_updated_wporg', '<', now()->subDays(730))
            ->where('is_abandoned', false)
            ->update(['is_abandoned' => true]);

        $unAbandoned = ExternalPluginCache::where('is_on_wporg', true)
            ->whereNotNull('last_updated_wporg')
            ->where('last_updated_wporg', '>=', now()->subDays(730))
            ->where('is_abandoned', true)
            ->update(['is_abandoned' => false]);

        if ($abandoned > 0 || $unAbandoned > 0) {
            $this->info("Abandoned status updated: {$abandoned} newly abandoned, {$unAbandoned} no longer abandoned.");
        }
    }

    /**
     * Format install count for display
     */
    private function formatInstalls(int $count): string
    {
        if ($count >= 1000000) {
            return round($count / 1000000) . 'M+';
        }
        if ($count >= 1000) {
            return round($count / 1000) . 'K+';
        }
        return (string) $count;
    }
}
