<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\Site;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AgentAuthMiddleware
{
    /**
     * Authenticate incoming agent requests.
     * Expects:
     *   - X-Agent-Key header: the plain API key
     *   - X-Site-Url header: the site's URL
     *
     * Validates by looking up the site by URL and comparing the SHA256 hash of the provided key.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $agentKey = $request->header('X-Agent-Key');
        $siteUrl = $request->header('X-Site-Url');

        if (empty($agentKey) || empty($siteUrl)) {
            return response()->json([
                'success' => false,
                'message' => 'Missing required headers: X-Agent-Key and X-Site-Url',
            ], 401);
        }

        // Look up site by URL. Older records may have been saved with a
        // trailing slash, while the agent normalizes before sending.
        $normalizedUrl = rtrim(trim($siteUrl), '/');
        $urlCandidates = array_values(array_unique(array_filter([
            trim($siteUrl),
            $normalizedUrl,
            $normalizedUrl . '/',
        ])));

        $site = Site::whereIn('url', $urlCandidates)->first();

        if (!$site) {
            // Try Docker networking alternatives
            $alternatives = [];

            // localhost ↔ host.docker.internal
            foreach ($urlCandidates as $candidate) {
                if (str_contains($candidate, 'localhost')) {
                    $alternatives[] = str_replace('localhost', 'host.docker.internal', $candidate);
                } elseif (str_contains($candidate, 'host.docker.internal')) {
                    $alternatives[] = str_replace('host.docker.internal', 'localhost', $candidate);
                }

                // Also try 127.0.0.1
                if (str_contains($candidate, '127.0.0.1')) {
                    $alternatives[] = str_replace('127.0.0.1', 'localhost', $candidate);
                    $alternatives[] = str_replace('127.0.0.1', 'host.docker.internal', $candidate);
                }
            }

            $alternatives = collect($alternatives)
                ->flatMap(fn ($url) => [rtrim($url, '/'), rtrim($url, '/') . '/'])
                ->unique()
                ->values()
                ->all();

            if (!empty($alternatives)) {
                $site = Site::whereIn('url', $alternatives)->first();
            }
        }

        if (!$site) {
            return response()->json([
                'success' => false,
                'message' => 'Site not found.',
            ], 401);
        }

        // Compare hashed key
        $hashedKey = hash('sha256', $agentKey);
        if (!hash_equals($site->api_secret_key, $hashedKey)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid API key.',
            ], 401);
        }

        // Attach site to request for use in controller
        $request->merge(['_agent_site' => $site]);

        return $next($request);
    }
}
