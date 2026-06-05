<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Models\User;
use App\Traits\ApiResponse;
use App\Traits\AuthorizesSiteAccess;
use App\Http\Requests\Site\StoreSiteRequest;
use App\Http\Requests\Site\UpdateSiteRequest;
use App\Services\ActivityLogService;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SiteController extends Controller
{
    use ApiResponse;
    use AuthorizesSiteAccess;

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

        // Allow the client to pick a page size from a fixed allow-list. We
        // cap the choices so a typo'd ?per_page=999999 can't blow up the
        // table render or the DB roundtrip.
        $perPage = (int) $request->input('per_page', 25);
        if (!in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $sites = $query->orderBy('created_at', 'desc')->paginate($perPage);

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

        // User assignment policy:
        //  - If the admin passed a non-empty `user_ids` list, honor it
        //    exactly (the admin made an explicit choice).
        //  - Otherwise auto-assign all active dev + mkt users so the new
        //    site is visible to those teams immediately. Without this,
        //    support staff (mkt) and developers wouldn't know the site
        //    exists until an admin manually added them.
        $explicitIds = (array) $request->input('user_ids', []);
        if (!empty($explicitIds)) {
            $site->users()->sync($explicitIds);
        } else {
            $defaultIds = User::query()
                ->whereIn('role', ['dev', 'mkt'])
                ->where('is_active', true)
                ->pluck('id')
                ->all();
            if (!empty($defaultIds)) {
                $site->users()->sync($defaultIds);
            }
        }

        ActivityLogService::log(
            'site.created',
            $site,
            $request->user(),
            $request->ip()
        );

        // Inherit the admin's default portal SMTP config so newly added sites
        // can send wp_mail without an extra trip to the SMTP tab. No-op when
        // the portal SMTP isn't configured yet (returns 'no_defaults' from
        // the seeder, which we ignore here).
        app(\App\Services\SiteSmtpSeederService::class)
            ->seedSite($site, overwrite: false, actorUserId: $request->user()->id);

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
        $this->assertSiteAccess($request, $site);

        $site->load(['hosting', 'users']);

        return $this->successResponse($site);
    }

    /**
     * PUT /api/sites/{site}
     */
    public function update(UpdateSiteRequest $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

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
        $this->assertSiteAccess($request, $site);

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
        // Only admin can regenerate, and only on sites they can see.
        // assertSiteAccess covers the latter (admin is always allowed by
        // Site::accessibleBy); the explicit role check stays so dev users
        // get a clear "admin only" message rather than a generic 403.
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Only admins can regenerate API keys.', 403);
        }
        $this->assertSiteAccess($request, $site);

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
        $this->assertSiteAccess($request, $site);

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
    public function toggleBetaTester(Request $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

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
        $this->assertSiteAccess($request, $site);

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
