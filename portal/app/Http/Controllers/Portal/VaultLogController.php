<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Models\VaultAccessLog;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VaultLogController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/sites/{site}/vault-logs
     * List vault access logs for a site.
     */
    public function index(Request $request, Site $site): JsonResponse
    {
        $user = $request->user();

        // MKT: no vault access
        if ($user->role === 'mkt') {
            return $this->errorResponse('You do not have access to vault logs.', 403);
        }

        // Check site accessibility for non-admin users
        if ($user->role !== 'admin' && !$site->users()->where('users.id', $user->id)->exists()) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        $perPage = min((int) $request->input('per_page', 20), 100);

        $query = VaultAccessLog::where('site_id', $site->id)
            ->with(['user:id,name,email', 'credential:id,label']);

        // Dev: only own actions
        if ($user->role === 'dev') {
            $query->where('user_id', $user->id);
        }

        // Filter by action
        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }

        // Filter by date range
        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->input('to') . ' 23:59:59');
        }

        $paginator = $query->orderByDesc('created_at')->paginate($perPage);

        $data = collect($paginator->items())->map(fn($log) => [
            'id' => $log->id,
            'user' => $log->user ? [
                'id' => $log->user->id,
                'name' => $log->user->name,
                'email' => $log->user->email,
            ] : null,
            'action' => $log->action,
            'field_key' => $log->field_key,
            'credential' => $log->credential ? [
                'id' => $log->credential->id,
                'label' => $log->credential->label,
            ] : null,
            'ip_address' => $log->ip_address,
            'created_at' => $log->created_at?->toISOString(),
        ]);

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
