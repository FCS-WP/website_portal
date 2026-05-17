<?php

namespace App\Services;

use App\Models\ExternalPluginCache;
use App\Models\Plugin;
use App\Models\PortalSetting;

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
