<?php

namespace App\Services;

use App\Models\PluginVersion;
use App\Models\PortalSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class SignedUrlService
{
    /**
     * Generate a signed download URL for a plugin version.
     * Token is stored in Redis with 10-minute expiry.
     *
     * @return array{url: string, token: string, expires_at: string}
     */
    public static function generateDownloadUrl(PluginVersion $version): array
    {
        $token = Str::random(64);
        $expiresAt = now()->addMinutes(10);

        // Store token in cache with version ID
        Cache::put("plugin_download:{$token}", [
            'plugin_version_id' => $version->id,
            'file_path' => $version->file_path,
            'file_hash' => $version->file_hash,
        ], $expiresAt);

        // The download URL must use the hostname the AGENT can resolve, not
        // the one browsers use. Inside docker the WP agent reaches the portal
        // via `host.docker.internal:8000`; from a remote site it'd be the
        // public portal hostname. `portal_base_url` (in portal_settings) is
        // the dedicated "agent-reachable URL" — falling back to APP_URL only
        // when the setting is missing.
        $baseUrl = rtrim(
            PortalSetting::where('key', 'portal_base_url')->value('value')
                ?: config('app.url', 'http://localhost:8000'),
            '/'
        );

        return [
            'url' => "{$baseUrl}/api/plugin-downloads/{$token}",
            'token' => $token,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /**
     * Validate a download token and return the file info.
     *
     * @return array|null — null if invalid/expired
     */
    public static function validateToken(string $token): ?array
    {
        $data = Cache::get("plugin_download:{$token}");

        if (!$data) {
            return null;
        }

        // Token is single-use: delete after retrieval
        // Actually, keep it valid for 10 min (multiple downloads possible in that window)
        // Cache::forget("plugin_download:{$token}");

        return $data;
    }
}
