<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Traits\ApiResponse;
use App\Http\Requests\Site\StoreSiteRequest;
use App\Http\Requests\Site\UpdateSiteRequest;
use App\Services\ActivityLogService;
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
        $siteData['api_secret_key_plain'] = $plainKey;

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
            'status' => 'pending', // Reset status since old key is invalid
        ]);

        ActivityLogService::log(
            'site.api_key_regenerated',
            $site,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse([
            'api_secret_key_plain' => $plainKey,
            'message' => 'API key regenerated. The site agent will need to be reconfigured with the new key.',
        ]);
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
}
