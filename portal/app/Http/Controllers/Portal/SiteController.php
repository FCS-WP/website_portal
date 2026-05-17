<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Traits\ApiResponse;
use App\Http\Requests\Site\StoreSiteRequest;
use App\Http\Requests\Site\UpdateSiteRequest;
use App\Services\ActivityLogService;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SiteController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/sites
     * List sites with filters, search, and pagination.
     * Dev/MKT users only see assigned sites.
     */
    public function index(Request $request)
    {
        $query = Site::with('hosting')
            ->withCount('users')
            ->accessibleBy($request->user());

        // Filter by status
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Filter by hosting
        if ($request->filled('hosting_id')) {
            $query->where('hosting_id', $request->hosting_id);
        }

        // Filter by tag
        if ($request->filled('tag')) {
            $query->whereJsonContains('tags', $request->tag);
        }

        // Search by name or URL
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('url', 'like', "%{$search}%");
            });
        }

        $sites = $query->orderBy('created_at', 'desc')->paginate(20);

        return $this->paginatedResponse($sites);
    }

    /**
     * POST /api/sites
     * Create a new site with generated API key.
     */
    public function store(StoreSiteRequest $request)
    {
        // Generate a random 64-char API key
        $plainKey = Str::random(64);
        $hashedKey = hash('sha256', $plainKey);

        $site = Site::create([
            ...$request->validated(),
            'api_secret_key' => $hashedKey,
            'api_key_encrypted' => encrypt($plainKey),
            'status' => 'pending',
            'created_by' => $request->user()->id,
        ]);

        // Assign users if provided
        if ($request->has('user_ids')) {
            $site->users()->sync($request->user_ids);
        }

        ActivityLogService::log(
            'site.created',
            $site,
            $request->user(),
            $request->ip()
        );

        // Return the plain key ONCE (it cannot be retrieved again)
        $siteData = $site->toArray();
        $siteData['api_key'] = $plainKey;

        return $this->successResponse($siteData, 'Site created successfully. Save the API key — it will not be shown again.', 201);
    }

    /**
     * GET /api/sites/{site}
     */
    public function show(Request $request, Site $site)
    {
        // Check access for non-admin users
        if ($request->user()->role !== 'admin') {
            if (!$site->users()->where('users.id', $request->user()->id)->exists()) {
                return $this->errorResponse('You do not have access to this site.', 403);
            }
        }

        $site->load(['hosting', 'users']);

        return $this->successResponse($site);
    }

    /**
     * PUT /api/sites/{site}
     */
    public function update(UpdateSiteRequest $request, Site $site)
    {
        $site->update($request->validated());

        // Update user assignments if provided
        if ($request->has('user_ids')) {
            $site->users()->sync($request->user_ids);
        }

        ActivityLogService::log(
            'site.updated',
            $site,
            $request->user(),
            $request->ip()
        );

        $site->load(['hosting', 'users']);

        return $this->successResponse($site, 'Site updated successfully.');
    }

    /**
     * DELETE /api/sites/{site}
     */
    public function destroy(Request $request, Site $site)
    {
        $site->delete();

        ActivityLogService::log(
            'site.deleted',
            $site,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse(null, 'Site deleted successfully.');
    }

    /**
     * POST /api/sites/{site}/regenerate-key
     * Admin only — regenerates the API secret key.
     */
    public function regenerateKey(Request $request, Site $site)
    {
        // Only admin can regenerate
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Only admins can regenerate API keys.', 403);
        }

        $plainKey = Str::random(64);
        $hashedKey = hash('sha256', $plainKey);

        $site->update([
            'api_secret_key' => $hashedKey,
            'api_key_encrypted' => encrypt($plainKey),
            'status' => 'pending', // Reset status since old key is invalid
        ]);

        ActivityLogService::log(
            'site.api_key_regenerated',
            $site,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse([
            'api_key' => $plainKey,
            'message' => 'API key regenerated. The site agent will need to be reconfigured with the new key.',
        ]);
    }

    /**
     * POST /api/sites/{id}/restore
     * Restore a soft-deleted site (admin only).
     */
    public function restore(Request $request, $id)
    {
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Only admins can restore deleted sites.', 403);
        }

        $site = Site::withTrashed()->findOrFail($id);
        $site->restore();

        ActivityLogService::log(
            'site.restored',
            $site,
            $request->user(),
            $request->ip()
        );

        $site->load(['hosting', 'users']);

        return $this->successResponse($site, 'Site restored successfully.');
    }

    /**
     * GET /api/sites/{site}/activity
     */
    public function activity(Request $request, Site $site)
    {
        // Check access for non-admin users
        if ($request->user()->role !== 'admin') {
            if (!$site->users()->where('users.id', $request->user()->id)->exists()) {
                return $this->errorResponse('You do not have access to this site.', 403);
            }
        }

        $logs = $site->activityLogs()
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return $this->paginatedResponse($logs);
    }

    /**
     * POST /api/sites/{site}/toggle-beta
     * Toggle beta tester status for a site.
     */
    public function toggleBetaTester(Site $site)
    {
        $site->update(['is_beta_tester' => !$site->is_beta_tester]);

        return response()->json([
            'success' => true,
            'message' => $site->is_beta_tester ? 'Site marked as beta tester' : 'Site removed from beta testers',
            'data' => ['is_beta_tester' => $site->is_beta_tester],
        ]);
    }

    /**
     * POST /api/sites/{site}/sync-now
     *
     * Tells the WP agent to immediately fire the regular ping (orders +
     * plugins + security). The agent's ping handler calls back into the
     * Portal's /api/agent/ping endpoint, so by the time we get the agent's
     * response the DB is already updated.
     *
     * Authenticated as a normal Portal user; site access is scoped through
     * Site::accessibleBy(). We re-decrypt the site's API key to authenticate
     * the outbound request to the WP agent.
     */
    public function syncNow(Request $request, Site $site)
    {
        // Defense: enforce the same scoping the rest of the controller uses.
        $hasAccess = Site::accessibleBy($request->user())->whereKey($site->id)->exists();
        if (!$hasAccess) {
            return $this->errorResponse('Site not accessible.', 403);
        }

        if (empty($site->api_key_encrypted)) {
            return $this->errorResponse('Site is missing its agent API key. Re-register the site to provision one.', 422);
        }

        try {
            // The ping runs synchronously inside the agent, and it itself calls
            // back to the Portal — give it generous headroom.
            $response = Http::timeout(60)
                ->withHeaders(['X-Agent-Key' => decrypt($site->api_key_encrypted)])
                ->acceptJson()
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/sync-now', []);
        } catch (\Throwable $e) {
            return $this->errorResponse('Could not reach the site agent: ' . $e->getMessage(), 502);
        }

        if (!$response->successful()) {
            return $this->errorResponse(
                'Agent rejected sync (HTTP ' . $response->status() . '). Check that the agent plugin is active and the API key matches.',
                502,
                ['agent_body' => $response->body()]
            );
        }

        ActivityLogService::log('site.sync_now', $site, $request->user(), $request->ip());

        // Refresh the site row so the response includes the new last_ping_at.
        $site->refresh();

        return $this->successResponse([
            'agent'         => $response->json(),
            'last_ping_at'  => optional($site->last_ping_at)->toIso8601String(),
        ], 'Sync triggered. Orders refreshed from the site.');
    }
}
