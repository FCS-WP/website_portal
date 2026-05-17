<?php

namespace App\Services;

use App\Models\ExternalPluginCache;
use App\Models\Plugin;
use App\Models\Site;
use App\Models\SitePlugin;
use Illuminate\Support\Facades\DB;

/**
 * Ingests the agent's `all_plugins` payload into the site_plugins table.
 *
 * Replaces the old syncCompanyPlugins() in AgentController which only handled
 * plugins prefixed with `epos-` and had a row in the `plugins` registry —
 * everything else (WooCommerce, ACF, etc.) was silently dropped, leaving the
 * site detail Plugins tab empty.
 *
 * Per Phase 6 PRD §2, each slug is classified as internal/wporg/premium and
 * the row is upserted on (site_id, plugin_slug). Plugins no longer reported
 * by the agent are removed so the table stays in sync with reality.
 */
class SitePluginIngestService
{
    /**
     * @param  Site  $site
     * @param  array $allPlugins  Each row: {slug, name, version, file, is_active, is_network_active?}
     * @return int               Number of plugins upserted.
     */
    public function ingest(Site $site, array $allPlugins): int
    {
        if (empty($allPlugins)) {
            // Don't aggressively wipe the table on an empty payload — the
            // agent might have a transient WooCommerce/plugin-load issue.
            return 0;
        }

        // Normalize + drop rows missing a slug.
        $rows = collect($allPlugins)
            ->filter(fn ($r) => !empty($r['slug']))
            ->values()
            ->all();

        $slugs = array_column($rows, 'slug');

        // One DB hit per source, no per-row queries.
        $classifications = PluginClassificationService::classifyBatch($slugs);
        $internalPlugins = Plugin::whereIn('slug', $slugs)->get()->keyBy('slug');
        $externalCache = ExternalPluginCache::whereIn('slug', $slugs)->get()->keyBy('slug');

        $now = now();
        $upsertedSlugs = [];

        DB::transaction(function () use ($site, $rows, $classifications, $internalPlugins, $externalCache, $now, &$upsertedSlugs) {
            foreach ($rows as $r) {
                $slug = $r['slug'];
                $type = $classifications[$slug] ?? 'premium';
                $installed = isset($r['version']) ? (string) $r['version'] : null;

                // Resolve latest_version + update_available based on type:
                //   - internal: from the company `plugins` registry (latest stable)
                //   - wporg:    from the WP.org version cache
                //   - premium:  unknown — leave null
                $latest = null;
                $pluginId = null;

                if ($type === 'internal' && $internalPlugins->has($slug)) {
                    /** @var \App\Models\Plugin $p */
                    $p = $internalPlugins->get($slug);
                    $pluginId = $p->id;
                    $latest = $this->getLatestStableVersionFor($p);
                } elseif ($type === 'wporg' && $externalCache->has($slug)) {
                    $latest = $externalCache->get($slug)->latest_version;
                }

                $updateAvailable = false;
                if ($installed && $latest) {
                    $updateAvailable = version_compare($installed, $latest, '<');
                }

                SitePlugin::updateOrCreate(
                    [
                        'site_id'     => $site->id,
                        'plugin_slug' => $slug,
                    ],
                    [
                        'plugin_id'         => $pluginId,
                        'plugin_name'       => $r['name'] ?? $slug,
                        'plugin_file'       => $r['file'] ?? null,
                        'plugin_type'       => $type,
                        'installed_version' => $installed,
                        'latest_version'    => $latest,
                        'is_active'         => !empty($r['is_active']) || !empty($r['active']),
                        'update_available'  => $updateAvailable,
                        'last_synced_at'    => $now,
                    ]
                );

                $upsertedSlugs[] = $slug;
            }

            // Drop site_plugins rows that the agent no longer reports —
            // that plugin was uninstalled on the WP side.
            $site->sitePlugins()
                ->whereNotIn('plugin_slug', $upsertedSlugs)
                ->delete();
        });

        return count($upsertedSlugs);
    }

    /**
     * Latest stable version string from the internal plugin's versions table.
     * Returns null when no stable version is registered.
     */
    private function getLatestStableVersionFor(Plugin $plugin): ?string
    {
        $versions = $plugin->versions()
            ->where('is_stable', true)
            ->pluck('version')
            ->all();

        if (empty($versions)) {
            return null;
        }

        usort($versions, 'version_compare');
        return end($versions);
    }
}
