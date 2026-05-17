<?php

namespace App\Services;

use App\Models\ExternalPluginCache;
use App\Models\Plugin;
use App\Models\PortalSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PluginClassificationService
{
    /**
     * Classify a plugin slug into internal, wporg, or premium
     */
    public static function classify(string $slug): string
    {
        // Step 1: Check company prefix
        $prefixes = self::getCompanyPrefixes();
        foreach ($prefixes as $prefix) {
            if (str_starts_with($slug, $prefix)) {
                // Also verify it exists in our plugins table
                if (Plugin::where('slug', $slug)->exists()) {
                    return 'internal';
                }
            }
        }

        // Step 2: Check if plugin exists in WP.org cache
        $cached = ExternalPluginCache::where('slug', $slug)->first();
        if ($cached && $cached->is_on_wporg) {
            return 'wporg';
        }

        // Step 3: Default to premium (not found in either)
        return 'premium';
    }

    /**
     * Classify multiple slugs at once (batch, more efficient)
     */
    public static function classifyBatch(array $slugs): array
    {
        $prefixes = self::getCompanyPrefixes();
        $internalSlugs = Plugin::whereIn('slug', $slugs)->pluck('slug')->toArray();
        $wporgSlugs = ExternalPluginCache::whereIn('slug', $slugs)
            ->where('is_on_wporg', true)
            ->pluck('slug')
            ->toArray();

        // Get all cached slugs (including is_on_wporg=false) to avoid re-checking
        $allCachedSlugs = ExternalPluginCache::whereIn('slug', $slugs)
            ->pluck('slug')
            ->toArray();

        $result = [];
        foreach ($slugs as $slug) {
            // Check internal first
            $isInternal = false;
            foreach ($prefixes as $prefix) {
                if (str_starts_with($slug, $prefix) && in_array($slug, $internalSlugs)) {
                    $isInternal = true;
                    break;
                }
            }

            if ($isInternal) {
                $result[$slug] = 'internal';
            } elseif (in_array($slug, $wporgSlugs)) {
                $result[$slug] = 'wporg';
            } else {
                $result[$slug] = 'premium';
            }
        }

        // For "premium" slugs not yet in the cache, check WP.org API as fallback
        $uncachedPremiumSlugs = array_filter(
            array_keys(array_filter($result, fn($type) => $type === 'premium')),
            fn($slug) => !in_array($slug, $allCachedSlugs)
        );

        if (!empty($uncachedPremiumSlugs)) {
            foreach ($uncachedPremiumSlugs as $slug) {
                try {
                    $response = Http::timeout(10)->get('https://api.wordpress.org/plugins/info/1.2/', [
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

                    if ($response->successful() && !$response->json('error')) {
                        $data = $response->json();
                        if ($data && isset($data['slug'])) {
                            $result[$slug] = 'wporg';

                            // Build download URL
                            $latestVersion = $data['version'] ?? null;
                            $downloadUrl = $data['download_link'] ?? null;
                            if (!$downloadUrl && $latestVersion) {
                                $downloadUrl = "https://downloads.wordpress.org/plugin/{$slug}.{$latestVersion}.zip";
                            }

                            // Parse last_updated
                            $lastUpdated = null;
                            if (!empty($data['last_updated'])) {
                                try {
                                    $lastUpdated = Carbon::parse($data['last_updated']);
                                } catch (\Exception $e) {
                                    // Ignore parse errors
                                }
                            }

                            // Create cache entry so future calls skip the API check
                            ExternalPluginCache::updateOrCreate(
                                ['slug' => $slug],
                                [
                                    'name' => $data['name'] ?? null,
                                    'author' => strip_tags($data['author'] ?? ''),
                                    'latest_version' => $latestVersion,
                                    'download_url' => $downloadUrl,
                                    'requires_wp' => $data['requires'] ?? null,
                                    'tested_up_to' => $data['tested'] ?? null,
                                    'rating' => isset($data['rating']) ? round($data['rating'] / 20, 2) : null,
                                    'active_installs' => $data['active_installs'] ?? null,
                                    'last_updated_wporg' => $lastUpdated,
                                    'is_on_wporg' => true,
                                    'is_abandoned' => $lastUpdated ? $lastUpdated->diffInDays(now()) > 730 : false,
                                    'last_synced_at' => now(),
                                ]
                            );
                        }
                    } else {
                        // Not on WP.org — cache this to avoid future API checks
                        ExternalPluginCache::updateOrCreate(
                            ['slug' => $slug],
                            [
                                'is_on_wporg' => false,
                                'last_synced_at' => now(),
                            ]
                        );
                    }

                    // 200ms delay to be respectful to WP.org API
                    usleep(200000);
                } catch (\Exception $e) {
                    Log::warning("PluginClassificationService: WP.org check failed for '{$slug}': {$e->getMessage()}");
                    // Keep as premium on failure
                }
            }
        }

        return $result;
    }

    /**
     * Get configured company plugin prefixes
     */
    private static function getCompanyPrefixes(): array
    {
        $setting = PortalSetting::where('key', 'company_plugin_prefixes')->first();
        if ($setting && $setting->value) {
            $decoded = json_decode($setting->value, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return ['epos-']; // default prefix
    }
}
