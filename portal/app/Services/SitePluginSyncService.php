<?php

namespace App\Services;

use App\Models\ExternalPluginCache;
use App\Models\Plugin;
use App\Models\Site;
use App\Models\SitePlugin;

class SitePluginSyncService
{
    public static function syncAll(Site $site, array $allPlugins): void
    {
        $slugs = array_column($allPlugins, 'slug');
        $classifications = PluginClassificationService::classifyBatch($slugs);

        $cachedVersions = ExternalPluginCache::whereIn('slug', $slugs)
            ->pluck('latest_version', 'slug')
            ->toArray();

        $internalPlugins = Plugin::whereIn('slug', $slugs)
            ->with('latestVersion')
            ->get()
            ->keyBy('slug');

        $syncedSlugs = [];

        foreach ($allPlugins as $pluginData) {
            $slug = $pluginData['slug'];
            $syncedSlugs[] = $slug;
            $type = $classifications[$slug] ?? 'premium';

            $latestVersion = null;
            $pluginId = null;

            if ($type === 'internal' && isset($internalPlugins[$slug])) {
                $pluginId = $internalPlugins[$slug]->id;
                $latestVersion = $internalPlugins[$slug]->latestVersion?->version;
            } elseif ($type === 'wporg') {
                $latestVersion = $cachedVersions[$slug] ?? null;
            }

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

        SitePlugin::where('site_id', $site->id)
            ->whereNotIn('plugin_slug', $syncedSlugs)
            ->delete();
    }
}
