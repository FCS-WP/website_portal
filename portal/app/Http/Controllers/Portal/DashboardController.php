<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Order;
use App\Models\Site;
use App\Models\SitePlugin;
use App\Traits\ApiResponse;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/dashboard/stats
     * Returns aggregated dashboard statistics.
     */
    public function stats(Request $request)
    {
        $user = $request->user();

        // Base query scoped by user access
        $sitesQuery = Site::accessibleBy($user);

        $totalSites = (clone $sitesQuery)->count();
        $onlineSites = (clone $sitesQuery)->where('status', 'connected')->count();
        $offlineSites = (clone $sitesQuery)->where('status', 'disconnected')->count();

        // Sites created this month
        $sitesThisMonth = (clone $sitesQuery)
            ->where('created_at', '>=', Carbon::now()->startOfMonth())
            ->count();

        // Plugin updates pending: count site_plugins where installed < latest
        $pluginUpdatesQuery = SitePlugin::whereHas('site', function ($q) use ($user) {
            $q->accessibleBy($user);
        })
            ->whereNotNull('installed_version')
            ->whereNotNull('latest_version')
            ->whereColumn('installed_version', '!=', 'latest_version');

        $pluginUpdatesPending = (clone $pluginUpdatesQuery)->count();
        $sitesWithUpdates = (clone $pluginUpdatesQuery)->distinct('site_id')->count('site_id');

        // Recent sites (top 5) with hosting name and last ping
        $recentSites = (clone $sitesQuery)
            ->with('hosting:id,name')
            ->select('id', 'name', 'url', 'status', 'hosting_id', 'last_ping_at', 'created_at')
            ->orderByDesc('last_ping_at')
            ->limit(5)
            ->get()
            ->map(function ($site) {
                return [
                    'id' => $site->id,
                    'name' => $site->name,
                    'url' => $site->url,
                    'status' => $site->status,
                    'hosting_name' => $site->hosting?->name ?? 'No hosting',
                    'last_seen_at' => $site->last_ping_at?->toIso8601String(),
                ];
            });

        // Recent activity logs (top 5)
        $recentActivity = ActivityLog::with('user:id,name')
            ->orderByDesc('created_at')
            ->limit(5)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'action' => $log->action,
                    'subject_type' => class_basename($log->subject_type ?? ''),
                    'subject_id' => $log->subject_id,
                    'description' => $this->formatActivityDescription($log),
                    'user_name' => $log->user?->name ?? 'System',
                    'created_at' => $log->created_at?->toIso8601String(),
                    'metadata' => $log->metadata,
                ];
            });

        return $this->successResponse([
            'total_sites' => $totalSites,
            'online_sites' => $onlineSites,
            'offline_sites' => $offlineSites,
            'sites_this_month' => $sitesThisMonth,
            'plugin_updates_pending' => $pluginUpdatesPending,
            'sites_with_updates' => $sitesWithUpdates,
            'recent_sites' => $recentSites,
            'recent_activity' => $recentActivity,
            'sites_online_trend' => $this->sitesOnlineTrend($onlineSites),
            'orders_this_week' => $this->ordersThisWeek($user),
            'recent_orders' => $this->recentOrders($user),
        ]);
    }

    // --- Recent orders across all accessible sites ---
    private function recentOrders(\App\Models\User $user): array
    {
        return Order::whereHas('site', function ($q) use ($user) {
            $q->accessibleBy($user);
        })
            ->with('site:id,name,url')
            ->orderByDesc('order_date')
            ->limit(8)
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'site_id' => $o->site_id,
                'site_name' => $o->site?->name,
                'order_number' => $o->order_number ?? ('#' . $o->woo_order_id),
                'status' => $o->status,
                'total' => (float) $o->total,
                'currency' => $o->currency,
                'customer_name' => $o->customer_name,
                'order_date' => $o->order_date?->toIso8601String(),
            ])
            ->all();
    }

    // --- Sites online: last 14 days, reconstructed from connect/disconnect logs ---
    private function sitesOnlineTrend(int $currentOnline): array
    {
        $since = Carbon::now()->subDays(13)->startOfDay();

        $events = ActivityLog::whereIn('action', ['site.connected', 'site.recovered', 'site.disconnected'])
            ->where('created_at', '>=', $since)
            ->get(['action', 'created_at']);

        $deltaByDay = [];
        foreach ($events as $e) {
            $day = $e->created_at->toDateString();
            $delta = $e->action === 'site.disconnected' ? -1 : 1;
            $deltaByDay[$day] = ($deltaByDay[$day] ?? 0) + $delta;
        }

        $days = [];
        for ($i = 0; $i <= 13; $i++) {
            $days[] = Carbon::now()->subDays(13 - $i)->startOfDay();
        }

        $totalDelta = array_sum($deltaByDay);
        $running = $currentOnline - $totalDelta;

        $series = [];
        foreach ($days as $day) {
            $key = $day->toDateString();
            $running += ($deltaByDay[$key] ?? 0);
            $series[] = [
                'date' => $key,
                'label' => $day->format('M j'),
                'online' => max(0, $running),
            ];
        }

        return $series;
    }

    // --- Orders this week (Mon-Sun), count + revenue + per-site breakdown per day ---
    private function ordersThisWeek(\App\Models\User $user): array
    {
        $weekStart = Carbon::now()->startOfWeek();

        $rows = Order::whereHas('site', function ($q) use ($user) {
            $q->accessibleBy($user);
        })
            ->where('order_date', '>=', $weekStart)
            ->join('sites', 'sites.id', '=', 'orders.site_id')
            ->select(
                DB::raw('DATE(orders.order_date) as day'),
                'orders.site_id',
                'sites.name as site_name',
                DB::raw('COUNT(*) as count'),
                DB::raw('COALESCE(SUM(orders.total), 0) as revenue')
            )
            ->groupBy(DB::raw('DATE(orders.order_date)'), 'orders.site_id', 'sites.name')
            ->get()
            ->groupBy('day');

        $series = [];
        for ($i = 0; $i < 7; $i++) {
            $day = (clone $weekStart)->addDays($i);
            $dayRows = $rows->get($day->toDateString()) ?? collect();

            $bySite = $dayRows
                ->sortByDesc('count')
                ->map(fn ($r) => [
                    'site_id' => (int) $r->site_id,
                    'site_name' => $r->site_name,
                    'count' => (int) $r->count,
                    'revenue' => (float) $r->revenue,
                ])
                ->values();

            $series[] = [
                'date' => $day->toDateString(),
                'label' => $day->format('D'),
                'count' => (int) $dayRows->sum('count'),
                'revenue' => (float) $dayRows->sum('revenue'),
                'by_site' => $bySite,
            ];
        }

        return [
            'total' => (int) array_sum(array_column($series, 'count')),
            'days' => $series,
        ];
    }

    /**
     * Format activity log into human-readable description.
     */
    private function formatActivityDescription(ActivityLog $log): string
    {
        $action = $log->action;
        $meta = $log->metadata ?? [];
        $userName = $log->user?->name ?? 'System';

        return match (true) {
            str_contains($action, 'site.created') => "Site created by {$userName}",
            str_contains($action, 'site.updated') => "Site updated by {$userName}",
            str_contains($action, 'site.deleted') => "Site deleted by {$userName}",
            str_contains($action, 'site.connected') => "Site connected",
            str_contains($action, 'site.disconnected') => "Site went offline",
            str_contains($action, 'site.api_key_regenerated') => "API key regenerated by {$userName}",
            str_contains($action, 'deployment') => "Plugin deployed by {$userName}",
            str_contains($action, 'plugin.created') => "Plugin created by {$userName}",
            str_contains($action, 'plugin.updated') => "Plugin updated by {$userName}",
            str_contains($action, 'version.uploaded') => "New version uploaded by {$userName}",
            str_contains($action, 'user.created') => "User created by {$userName}",
            str_contains($action, 'user.updated') => "User updated by {$userName}",
            str_contains($action, 'ping') => "Site pinged",
            default => "{$action} by {$userName}",
        };
    }
}
