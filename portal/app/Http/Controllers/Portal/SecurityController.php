<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Jobs\ScanFileIntegrityJob;
use App\Models\FileIntegrityBaseline;
use App\Models\FileIntegrityFinding;
use App\Models\LoginEvent;
use App\Models\SecurityAlert;
use App\Models\SecurityScanRun;
use App\Models\Site;
use App\Models\Site2faSetting;
use App\Models\SiteAdminUser;
use App\Models\SiteSecurityScore;
use App\Models\SiteVulnerability;
use App\Models\VulnerabilityDefinition;
use App\Services\SecurityScoreService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SecurityController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/admin/security/overview
     * Aggregated security data across all sites.
     */
    public function overview(): JsonResponse
    {
        $totalSites = Site::count();

        // Average score from latest scores per site
        $latestScores = SiteSecurityScore::query()
            ->selectRaw('site_id, MAX(score_date) as latest_date')
            ->groupBy('site_id')
            ->get()
            ->pluck('latest_date', 'site_id');

        $scores = SiteSecurityScore::query()
            ->whereIn('site_id', $latestScores->keys())
            ->where(function ($q) use ($latestScores) {
                foreach ($latestScores as $siteId => $date) {
                    $q->orWhere(function ($sub) use ($siteId, $date) {
                        $sub->where('site_id', $siteId)->where('score_date', $date);
                    });
                }
            })
            ->get();

        $averageScore = $scores->avg('score') ? (int) round($scores->avg('score')) : 0;

        // Score distribution
        $distribution = ['excellent' => 0, 'good' => 0, 'fair' => 0, 'poor' => 0];
        foreach ($scores as $score) {
            if ($score->score >= 90) {
                $distribution['excellent']++;
            } elseif ($score->score >= 70) {
                $distribution['good']++;
            } elseif ($score->score >= 50) {
                $distribution['fair']++;
            } else {
                $distribution['poor']++;
            }
        }

        // Alert counts
        $criticalAlerts = SecurityAlert::where('status', 'open')->where('severity', 'critical')->count();
        $highAlerts = SecurityAlert::where('status', 'open')->where('severity', 'high')->count();

        // Unresolved vulnerabilities
        $unresolvedVulnerabilities = SiteVulnerability::where('status', 'open')->count();

        // Sites without 2FA
        $sitesWithout2fa = $totalSites - Site2faSetting::where('enabled', true)->distinct('site_id')->count('site_id');

        // Recent alerts
        $recentAlerts = SecurityAlert::with('site:id,name')
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        return $this->successResponse([
            'total_sites' => $totalSites,
            'average_score' => $averageScore,
            'critical_alerts' => $criticalAlerts,
            'high_alerts' => $highAlerts,
            'unresolved_vulnerabilities' => $unresolvedVulnerabilities,
            'sites_without_2fa' => $sitesWithout2fa,
            'recent_alerts' => $recentAlerts,
            'score_distribution' => $distribution,
        ]);
    }

    /**
     * GET /api/admin/security/alerts
     * Paginated list of security alerts with filtering.
     */
    public function alerts(Request $request): JsonResponse
    {
        $query = SecurityAlert::with('site:id,name');

        if ($request->filled('severity')) {
            $severities = explode(',', $request->severity);
            $query->whereIn('severity', $severities);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->site_id);
        }

        if ($request->filled('type')) {
            $query->where('alert_type', $request->type);
        }

        $alerts = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($alerts);
    }

    /**
     * PATCH /api/admin/security/alerts/{alert}
     * Update alert status.
     */
    public function updateAlert(Request $request, SecurityAlert $alert): JsonResponse
    {
        $request->validate([
            'status' => 'required|in:acknowledged,resolved,false_positive',
        ]);

        $data = ['status' => $request->status];

        if (in_array($request->status, ['resolved', 'false_positive'])) {
            $data['resolved_at'] = now();
        }

        if ($request->status === 'acknowledged') {
            $data['acknowledged_by'] = $request->user()->id;
            $data['acknowledged_at'] = now();
        }

        $alert->update($data);

        return $this->successResponse($alert->fresh(), 'Alert updated successfully.');
    }

    /**
     * GET /api/admin/security/vulnerabilities
     * Paginated list of site vulnerabilities.
     */
    public function vulnerabilities(Request $request): JsonResponse
    {
        $query = SiteVulnerability::with(['vulnerability', 'site:id,name']);

        if ($request->filled('severity')) {
            $severities = explode(',', $request->severity);
            $query->whereHas('vulnerability', function ($q) use ($severities) {
                $q->whereIn('severity', $severities);
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->site_id);
        }

        $vulnerabilities = $query
            ->orderByRaw("CASE
                WHEN EXISTS (SELECT 1 FROM vulnerability_definitions vd WHERE vd.id = site_vulnerabilities.vulnerability_id AND vd.severity = 'critical') THEN 1
                WHEN EXISTS (SELECT 1 FROM vulnerability_definitions vd WHERE vd.id = site_vulnerabilities.vulnerability_id AND vd.severity = 'high') THEN 2
                WHEN EXISTS (SELECT 1 FROM vulnerability_definitions vd WHERE vd.id = site_vulnerabilities.vulnerability_id AND vd.severity = 'medium') THEN 3
                ELSE 4
            END")
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($vulnerabilities);
    }

    /**
     * GET /api/admin/security/vulnerability-definitions
     * Paginated list from vulnerability database with counts.
     */
    public function vulnerabilityDefinitions(Request $request): JsonResponse
    {
        $query = VulnerabilityDefinition::withCount('siteVulnerabilities');

        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('plugin_slug', 'like', "%{$search}%")
                    ->orWhere('plugin_name', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('cve_id', 'like', "%{$search}%");
            });
        }

        $definitions = $query->orderBy('published_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($definitions);
    }

    /**
     * GET /api/admin/security/scores
     * List all sites with their latest security score.
     */
    public function scores(Request $request): JsonResponse
    {
        $query = Site::query()
            ->select('sites.id', 'sites.name', 'sites.url')
            ->leftJoinSub(
                SiteSecurityScore::selectRaw('site_id, score, breakdown, calculated_at, ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY score_date DESC) as rn'),
                'latest_scores',
                function ($join) {
                    $join->on('sites.id', '=', 'latest_scores.site_id')
                        ->where('latest_scores.rn', '=', 1);
                }
            )
            ->addSelect('latest_scores.score', 'latest_scores.breakdown', 'latest_scores.calculated_at');

        if ($request->filled('below')) {
            $threshold = (int) $request->below;
            $query->where(function ($q) use ($threshold) {
                $q->where('latest_scores.score', '<', $threshold)
                    ->orWhereNull('latest_scores.score');
            });
        }

        $sortDirection = $request->get('sort', 'desc');
        if (!in_array($sortDirection, ['asc', 'desc'])) {
            $sortDirection = 'desc';
        }

        $sites = $query->orderByRaw('latest_scores.score IS NULL, latest_scores.score ' . $sortDirection)
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($sites);
    }

    /**
     * GET /api/admin/security/sites/{site}
     * Full security detail for a single site.
     */
    public function siteSecurityDetail(Site $site): JsonResponse
    {
        $latestScore = $site->securityScores()
            ->orderBy('score_date', 'desc')
            ->first();

        $recentAlerts = $site->securityAlerts()
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $activeVulnerabilities = $site->siteVulnerabilities()
            ->with('vulnerability')
            ->where('status', 'open')
            ->get();

        $fileFindings = $site->fileIntegrityFindings()
            ->where('status', 'open')
            ->orderBy('detected_at', 'desc')
            ->get();

        $adminUsers = $site->siteAdminUsers()->get();

        $twoFaStatus = $site->site2faSetting;

        $recentLogins = $site->loginEvents()
            ->orderBy('occurred_at', 'desc')
            ->limit(50)
            ->get();

        $scanRuns = $site->securityScanRuns()
            ->orderBy('started_at', 'desc')
            ->limit(10)
            ->get();

        return $this->successResponse([
            'score' => $latestScore,
            'recent_alerts' => $recentAlerts,
            'active_vulnerabilities' => $activeVulnerabilities,
            'file_findings' => $fileFindings,
            'admin_users' => $adminUsers,
            'two_fa_status' => $twoFaStatus,
            'recent_logins' => $recentLogins,
            'scan_runs' => $scanRuns,
        ]);
    }

    /**
     * GET /api/admin/security/sites/{site}/file-findings
     * Paginated file integrity findings for a site.
     */
    public function siteFileFindings(Request $request, Site $site): JsonResponse
    {
        $query = $site->fileIntegrityFindings();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('severity')) {
            $severities = explode(',', $request->severity);
            $query->whereIn('severity', $severities);
        }

        $findings = $query->orderBy('detected_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($findings);
    }

    /**
     * GET /api/admin/security/sites/{site}/login-events
     * Paginated login events for a site.
     */
    public function siteLoginEvents(Request $request, Site $site): JsonResponse
    {
        $query = $site->loginEvents();

        if ($request->filled('status')) {
            $statuses = explode(',', $request->status);
            $query->whereIn('event_type', $statuses);
        }

        if ($request->filled('ip')) {
            $query->where('ip_address', $request->ip);
        }

        if ($request->filled('username')) {
            $query->where('username', 'like', '%' . $request->username . '%');
        }

        $events = $query->orderBy('occurred_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return $this->paginatedResponse($events);
    }

    /**
     * GET /api/admin/security/sites/{site}/admin-users
     * List admin users for a site.
     */
    public function siteAdminUsers(Site $site): JsonResponse
    {
        $adminUsers = $site->siteAdminUsers()->get();

        return $this->successResponse($adminUsers);
    }

    /**
     * GET /api/admin/security/sites/{site}/2fa
     * Get 2FA configuration status for a site.
     */
    public function site2faStatus(Site $site): JsonResponse
    {
        $setting = $site->site2faSetting;

        return $this->successResponse($setting);
    }

    /**
     * GET /api/admin/security/2fa-dashboard
     * Overview of 2FA status across all sites.
     */
    public function twofaDashboard(): JsonResponse
    {
        $totalSites = Site::count();
        $sitesWithSettings = Site2faSetting::where('enabled', true)->pluck('site_id');
        $sitesWith2fa = $sitesWithSettings->count();
        $sitesWithout2fa = $totalSites - $sitesWith2fa;

        $sitesList = Site::select('id', 'name', 'url')
            ->with('site2faSetting:id,site_id,enabled,method')
            ->get()
            ->map(function ($site) {
                return [
                    'id' => $site->id,
                    'name' => $site->name,
                    'url' => $site->url,
                    'is_enabled' => $site->site2faSetting?->enabled ?? false,
                    'provider' => $site->site2faSetting?->method,
                ];
            });

        return $this->successResponse([
            'total_sites' => $totalSites,
            'sites_with_2fa' => $sitesWith2fa,
            'sites_without_2fa' => $sitesWithout2fa,
            'sites_list' => $sitesList,
        ]);
    }

    /**
     * POST /api/admin/security/sites/{site}/2fa/enable
     * Trigger 2FA enable on the agent.
     */
    public function enable2fa(Request $request, Site $site): JsonResponse
    {
        $request->validate([
            'method' => 'required|string|in:totp,email,sms',
        ]);

        $response = Http::timeout(30)
            ->withHeaders([
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ])
            ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/security/2fa/enable', [
                'method' => $request->input('method'),
            ]);

        if ($response->successful()) {
            // Update local database to reflect the change
            Site2faSetting::updateOrCreate(
                ['site_id' => $site->id],
                [
                    'enabled' => true,
                    'method' => $request->input('method'),
                    'enabled_at' => now(),
                    'enabled_by' => auth()->id(),
                ]
            );

            return $this->successResponse($response->json(), 'Two-factor authentication enabled.');
        }

        return $this->errorResponse(
            'Failed to enable 2FA on agent: ' . ($response->json('message') ?? 'Unknown error'),
            $response->status()
        );
    }

    /**
     * POST /api/admin/security/sites/{site}/2fa/disable
     * Trigger 2FA disable on the agent.
     */
    public function disable2fa(Site $site): JsonResponse
    {
        $response = Http::timeout(30)
            ->withHeaders([
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ])
            ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/security/2fa/disable');

        if ($response->successful()) {
            // Update local database to reflect the change
            Site2faSetting::updateOrCreate(
                ['site_id' => $site->id],
                [
                    'enabled' => false,
                    'method' => null,
                    'enabled_at' => null,
                    'enabled_by' => null,
                ]
            );

            return $this->successResponse($response->json(), 'Two-factor authentication disabled.');
        }

        return $this->errorResponse(
            'Failed to disable 2FA on agent: ' . ($response->json('message') ?? 'Unknown error'),
            $response->status()
        );
    }

    /**
     * POST /api/admin/security/sites/{site}/scan/files
     * Manually trigger a file integrity scan for a site.
     */
    public function triggerFileScan(Site $site): JsonResponse
    {
        ScanFileIntegrityJob::dispatch($site);

        return $this->successResponse(null, 'File integrity scan has been queued.', 202);
    }

    /**
     * POST /api/admin/security/sites/{site}/baseline/create
     * Trigger baseline creation on the agent.
     */
    public function triggerBaselineCreate(Request $request, Site $site): JsonResponse
    {
        $response = Http::timeout(60)
            ->withHeaders([
                'X-Agent-Key' => decrypt($site->api_key_encrypted),
                'Accept' => 'application/json',
            ])
            ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/security/baseline/create');

        if ($response->successful()) {
            $result = $response->json();

            // Store baseline locally
            FileIntegrityBaseline::updateOrCreate(
                ['site_id' => $site->id],
                [
                    'file_hashes' => $result['file_hashes'] ?? [],
                    'file_count' => $result['file_count'] ?? 0,
                    'created_by' => $request->user()->id,
                ]
            );

            return $this->successResponse($result, 'Baseline created successfully.');
        }

        return $this->errorResponse(
            'Failed to create baseline on agent: ' . ($response->json('message') ?? 'Unknown error'),
            $response->status()
        );
    }

    /**
     * POST /api/admin/security/sites/{site}/score/recalculate
     * Manually recalculate security score for a site.
     */
    public function recalculateScore(Site $site): JsonResponse
    {
        SecurityScoreService::recalculateAndStore($site);

        $newScore = $site->securityScores()
            ->orderBy('score_date', 'desc')
            ->first();

        return $this->successResponse($newScore, 'Security score recalculated.');
    }
}
