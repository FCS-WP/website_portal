<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class QueueController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/queue/failed-jobs
     * List failed queue jobs with pagination and filters.
     */
    public function index(Request $request)
    {
        $query = DB::table('failed_jobs')->orderByDesc('failed_at');

        // Filter by queue name
        if ($request->filled('queue')) {
            $query->where('queue', $request->input('queue'));
        }

        // Filter by date range: 24h / 7d / 30d / all
        $dateRange = $request->input('date_range', 'all');
        switch ($dateRange) {
            case '24h':
                $query->where('failed_at', '>=', now()->subDay());
                break;
            case '7d':
                $query->where('failed_at', '>=', now()->subDays(7));
                break;
            case '30d':
                $query->where('failed_at', '>=', now()->subDays(30));
                break;
            case 'all':
            default:
                // No date filter
                break;
        }

        $perPage = (int) $request->input('per_page', 20);
        $paginator = $query->paginate($perPage);

        // Transform items: parse payload, truncate exception
        $items = collect($paginator->items())->map(function ($row) {
            $payload = json_decode($row->payload, true);
            $jobClass = $payload['displayName'] ?? null;

            $errorSummary = $row->exception
                ? mb_substr($row->exception, 0, 200)
                : null;

            return [
                'id' => $row->id,
                'uuid' => $row->uuid,
                'connection' => $row->connection,
                'queue' => $row->queue,
                'job_class' => $jobClass,
                'error_summary' => $errorSummary,
                'failed_at' => $row->failed_at,
            ];
        })->all();

        return $this->paginatedResponse($paginator, $items);
    }

    /**
     * GET /api/queue/failed-jobs/{uuid}
     * Show full failed job record.
     */
    public function show(string $uuid)
    {
        $row = DB::table('failed_jobs')->where('uuid', $uuid)->first();

        if (!$row) {
            return $this->errorResponse('Failed job not found.', 404);
        }

        $payload = json_decode($row->payload, true) ?: [];

        $data = [
            'id' => $row->id,
            'uuid' => $row->uuid,
            'connection' => $row->connection,
            'queue' => $row->queue,
            'job_class' => $payload['displayName'] ?? null,
            'attempts' => $payload['attempts'] ?? null,
            'data' => $payload['data'] ?? null,
            'payload' => $payload,
            'exception' => $row->exception,
            'failed_at' => $row->failed_at,
        ];

        return $this->successResponse($data);
    }

    /**
     * POST /api/queue/failed-jobs/{uuid}/retry
     * Retry a single failed job by UUID.
     */
    public function retry(string $uuid)
    {
        $exists = DB::table('failed_jobs')->where('uuid', $uuid)->exists();

        if (!$exists) {
            return $this->errorResponse('Failed job not found.', 404);
        }

        Artisan::call('queue:retry', ['id' => [$uuid]]);

        return $this->successResponse(null, 'Failed job queued for retry.');
    }

    /**
     * DELETE /api/queue/failed-jobs/{uuid}
     * Forget (delete) a failed job by UUID.
     */
    public function destroy(string $uuid)
    {
        $exists = DB::table('failed_jobs')->where('uuid', $uuid)->exists();

        if (!$exists) {
            return $this->errorResponse('Failed job not found.', 404);
        }

        Artisan::call('queue:forget', ['id' => $uuid]);

        return $this->successResponse(null, 'Failed job removed.');
    }

    /**
     * POST /api/queue/failed-jobs/retry-all
     * Retry all failed jobs.
     */
    public function retryAll()
    {
        Artisan::call('queue:retry', ['id' => ['all']]);

        return $this->successResponse(null, 'All failed jobs queued for retry.');
    }

    /**
     * DELETE /api/queue/failed-jobs/flush
     * Flush all failed jobs.
     */
    public function flush()
    {
        Artisan::call('queue:flush');

        return $this->successResponse(null, 'All failed jobs flushed.');
    }

    /**
     * GET /api/queue/stats
     * Return queue statistics.
     */
    public function stats()
    {
        $failedCount = DB::table('failed_jobs')->count();
        $pendingCount = DB::table('jobs')->count();
        $lastFailure = DB::table('failed_jobs')
            ->orderByDesc('failed_at')
            ->value('failed_at');

        return $this->successResponse([
            'failed_count' => $failedCount,
            'pending_count' => $pendingCount,
            'last_failure_at' => $lastFailure,
        ]);
    }
}
