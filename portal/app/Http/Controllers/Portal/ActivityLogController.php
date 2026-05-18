<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Site;
use App\Services\ActivityLogPresenter;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Global activity-log feed (Sidebar → Activity Logs).
 *
 * Access policy (route is admin,dev — MKT is blocked at the route guard):
 *
 *   admin → every row
 *   dev   → rows whose subject is one of the user's assigned sites, OR rows
 *           that aren't site-scoped at all (e.g. plugin.created, user.updated).
 *           This keeps dev workflows discoverable (they can see when an admin
 *           deploys a plugin they'd care about) while hiding site-specific
 *           activity from sites they aren't on.
 */
class ActivityLogController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $request->validate([
            'action'  => 'nullable|string|max:100',
            'user_id' => 'nullable|integer|exists:users,id',
            'site_id' => 'nullable|integer|exists:sites,id',
            'from'    => 'nullable|date',
            'to'      => 'nullable|date',
            'page'    => 'nullable|integer|min:1',
            'per_page'=> 'nullable|integer|min:1|max:100',
        ]);

        $user = $request->user();
        $query = ActivityLog::with('user:id,name,role')
            ->orderByDesc('created_at');

        // ── role scoping ─────────────────────────────────────────────────
        if ($user->role !== 'admin') {
            $siteClass = Site::class;
            $assignedSiteIds = Site::accessibleBy($user)->pluck('id');

            // Either the row is unrelated to a Site, or its Site is one the
            // user is assigned to. Wrapped so any later AND filter doesn't
            // accidentally widen the scope (Eloquent grouping pitfall).
            $query->where(function ($q) use ($siteClass, $assignedSiteIds) {
                $q->where('subject_type', '!=', $siteClass)
                  ->orWhereNull('subject_type')
                  ->orWhere(function ($qq) use ($siteClass, $assignedSiteIds) {
                      $qq->where('subject_type', $siteClass)
                         ->whereIn('subject_id', $assignedSiteIds);
                  });
            });
        }

        // ── filters ──────────────────────────────────────────────────────
        if ($request->filled('action')) {
            // Allow partial prefix matches so "site." surfaces every site.* event.
            $query->where('action', 'like', $request->action . '%');
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->user_id);
        }

        if ($request->filled('site_id')) {
            $siteId = (int) $request->site_id;
            // Re-check access (a Dev shouldn't be able to filter for someone
            // else's site to confirm activity exists there).
            if ($user->role !== 'admin') {
                $hasAccess = Site::accessibleBy($user)->whereKey($siteId)->exists();
                if (!$hasAccess) {
                    return $this->errorResponse('You do not have access to this site.', 403);
                }
            }
            $query->where('subject_type', Site::class)->where('subject_id', $siteId);
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', Carbon::parse($request->from)->startOfDay());
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', Carbon::parse($request->to)->endOfDay());
        }

        // ── pagination ───────────────────────────────────────────────────
        $perPage = min((int) $request->input('per_page', 25), 100);
        $logs = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $logs->getCollection()->map(fn ($l) => ActivityLogPresenter::present($l))->values(),
            'meta'    => [
                'total'     => $logs->total(),
                'page'      => $logs->currentPage(),
                'per_page'  => $logs->perPage(),
                'last_page' => $logs->lastPage(),
            ],
        ]);
    }

    /**
     * Distinct action keys + users for populating the filter dropdowns.
     * Cheap: index hits on action + user_id are both single-column scans.
     */
    public function filterOptions(Request $request)
    {
        $user = $request->user();
        $query = ActivityLog::query();

        if ($user->role !== 'admin') {
            $assignedSiteIds = Site::accessibleBy($user)->pluck('id');
            $siteClass = Site::class;
            $query->where(function ($q) use ($siteClass, $assignedSiteIds) {
                $q->where('subject_type', '!=', $siteClass)
                  ->orWhereNull('subject_type')
                  ->orWhereIn('subject_id', $assignedSiteIds);
            });
        }

        $actions = (clone $query)
            ->distinct()
            ->orderBy('action')
            ->pluck('action');

        // Users who have logged any visible activity. We join through
        // user_id so we don't list inactive/system rows.
        $userIds = (clone $query)
            ->whereNotNull('user_id')
            ->distinct()
            ->pluck('user_id');

        $users = \App\Models\User::whereIn('id', $userIds)
            ->orderBy('name')
            ->get(['id', 'name', 'role']);

        return $this->successResponse([
            'actions' => $actions,
            'users'   => $users,
        ]);
    }
}
