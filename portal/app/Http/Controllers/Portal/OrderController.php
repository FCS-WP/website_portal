<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Site;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Phase 7 — Orders Management API.
 *
 * Endpoints mirror PRD §7.1. All "global" endpoints automatically scope to
 * sites accessible by the current user (Admin sees all; Dev/MKT see assigned
 * sites). Order lookup is bound to the same scope to prevent leaking orders
 * across tenants.
 */
class OrderController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/orders
     * Global list with filters + pagination + most_active_today.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $accessibleSiteIds = Site::accessibleBy($user)->pluck('id');

        $query = Order::query()
            ->with('site:id,name,url')
            ->whereIn('site_id', $accessibleSiteIds);

        $this->applyCommonFilters($query, $request);

        if ($request->filled('site_id')) {
            $query->where('site_id', (int) $request->input('site_id'));
        }

        $perPage = min((int) $request->input('per_page', 20), 50);
        $page = max(1, (int) $request->input('page', 1));

        $orders = $query->orderByDesc('order_date')->paginate($perPage, ['*'], 'page', $page);

        $lastSyncedAt = Order::whereIn('site_id', $accessibleSiteIds)->max('synced_at');

        return response()->json([
            'success' => true,
            'data' => $orders->getCollection()->map(fn ($o) => $this->serializeOrder($o, summary: true)),
            'meta' => [
                'total' => $orders->total(),
                'page' => $orders->currentPage(),
                'per_page' => $orders->perPage(),
                'last_page' => $orders->lastPage(),
                'last_synced_at' => $lastSyncedAt,
            ],
            'most_active_today' => $this->mostActiveToday($accessibleSiteIds, 5),
        ]);
    }

    /**
     * GET /api/orders/search?order_id=...&site_id=...
     */
    public function search(Request $request)
    {
        $request->validate([
            'order_id' => 'required|string|max:50',
            'site_id'  => 'nullable|integer|exists:sites,id',
        ]);

        $user = $request->user();
        $accessibleSites = Site::accessibleBy($user)->get(['id', 'name', 'url']);
        $accessibleSiteIds = $accessibleSites->pluck('id');

        $orderId = trim($request->input('order_id'), " \t\n\r\0\x0B#");

        $query = Order::with('site:id,name,url')
            ->whereIn('site_id', $accessibleSiteIds)
            ->where(function ($q) use ($orderId) {
                $q->where('woo_order_id', $orderId)
                  ->orWhere('order_number', $orderId);
            });

        if ($request->filled('site_id')) {
            $query->where('site_id', (int) $request->input('site_id'));
        }

        $orders = $query->orderByDesc('order_date')->get();

        if ($orders->isNotEmpty()) {
            return response()->json([
                'success' => true,
                'found' => true,
                'orders' => $orders->map(fn ($o) => $this->serializeOrder($o)),
            ]);
        }

        // Build the WP-admin search fallback URLs so the user can hop to
        // wp-admin and search the full order history themselves.
        $fallbackSites = $request->filled('site_id')
            ? $accessibleSites->where('id', (int) $request->input('site_id'))->values()
            : $accessibleSites;

        return response()->json([
            'success' => true,
            'found' => false,
            'message' => "Order #{$orderId} not found in Portal's cached orders. It may be older than the 200-order window.",
            'wp_admin_search_urls' => $fallbackSites->map(fn ($s) => [
                'site_id'   => $s->id,
                'site_name' => $s->name,
                'url'       => rtrim($s->url, '/') . "/wp-admin/edit.php?post_type=shop_order&s={$orderId}",
            ])->values(),
        ]);
    }

    /**
     * GET /api/orders/{id}
     * Full detail for the inline panel.
     */
    public function show(Request $request, Order $order)
    {
        $this->authorizeSiteAccess($request, $order->site_id);
        $order->load('site:id,name,url');

        return $this->successResponse($this->serializeOrder($order));
    }

    /**
     * GET /api/orders/filter-options
     * Dynamic dropdowns: only sites/statuses/payment-methods that actually
     * appear in the cached orders the user can see.
     */
    public function filterOptions(Request $request)
    {
        $user = $request->user();
        $accessibleSiteIds = Site::accessibleBy($user)->pluck('id');

        $sites = Site::whereIn('id', $accessibleSiteIds)
            ->whereIn('id', Order::select('site_id')->whereIn('site_id', $accessibleSiteIds))
            ->orderBy('name')
            ->get(['id', 'name']);

        $statuses = Order::whereIn('site_id', $accessibleSiteIds)
            ->whereNotNull('status')
            ->distinct()
            ->pluck('status')
            ->filter()
            ->values();

        $payments = Order::whereIn('site_id', $accessibleSiteIds)
            ->whereNotNull('payment_method')
            ->select('payment_method', 'payment_method_title')
            ->distinct()
            ->get()
            ->map(fn ($r) => [
                'slug'  => $r->payment_method,
                'title' => $r->payment_method_title ?: $r->payment_method,
            ])
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'sites'           => $sites,
                'statuses'        => $statuses,
                'payment_methods' => $payments,
            ],
        ]);
    }

    /**
     * GET /api/orders/most-active
     * Top sites by order_count_today.
     */
    public function mostActive(Request $request)
    {
        $user = $request->user();
        $accessibleSiteIds = Site::accessibleBy($user)->pluck('id');
        $limit = min(20, max(1, (int) $request->input('limit', 10)));

        return response()->json([
            'success' => true,
            'data' => $this->mostActiveToday($accessibleSiteIds, $limit),
        ]);
    }

    /**
     * GET /api/sites/{site}/orders
     * Per-site list (Site Detail Orders tab).
     */
    public function siteIndex(Request $request, Site $site)
    {
        $this->authorizeSiteAccess($request, $site->id);

        $query = $site->orders()->with('site:id,name,url');
        $this->applyCommonFilters($query, $request);

        $perPage = min((int) $request->input('per_page', 20), 50);
        $page = max(1, (int) $request->input('page', 1));
        $orders = $query->orderByDesc('order_date')->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'success' => true,
            'data' => $orders->getCollection()->map(fn ($o) => $this->serializeOrder($o, summary: true)),
            'meta' => [
                'total' => $orders->total(),
                'page' => $orders->currentPage(),
                'per_page' => $orders->perPage(),
                'last_page' => $orders->lastPage(),
            ],
            'stats' => $this->siteStatsFor($site),
        ]);
    }

    /**
     * GET /api/sites/{site}/orders/stats
     * Mini stats for the per-site tab header.
     */
    public function siteStats(Request $request, Site $site)
    {
        $this->authorizeSiteAccess($request, $site->id);
        return response()->json([
            'success' => true,
            'data' => $this->siteStatsFor($site),
        ]);
    }

    // ─── helpers ────────────────────────────────────────────────────────

    private function applyCommonFilters($query, Request $request): void
    {
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('payment')) {
            $query->where('payment_method', $request->input('payment'));
        }
        if ($request->filled('from')) {
            $query->where('order_date', '>=', Carbon::parse($request->input('from')));
        }
        if ($request->filled('to')) {
            $query->where('order_date', '<=', Carbon::parse($request->input('to')));
        }
    }

    private function siteStatsFor(Site $site): array
    {
        return [
            'orders_today'    => $site->orders()->whereDate('order_date', today())->count(),
            'processing_now' => $site->orders()->where('status', 'processing')->count(),
            'last_order_at'  => $site->orders()->max('order_date'),
        ];
    }

    private function mostActiveToday($accessibleSiteIds, int $limit): array
    {
        return Order::whereIn('site_id', $accessibleSiteIds)
            ->whereDate('order_date', today())
            ->selectRaw('site_id, COUNT(*) as order_count_today')
            ->groupBy('site_id')
            ->orderByDesc('order_count_today')
            ->limit($limit)
            ->with('site:id,name,url')
            ->get()
            ->map(fn ($r) => [
                'site_id' => $r->site_id,
                'site_name' => $r->site?->name,
                'site_url'  => $r->site?->url,
                'order_count_today' => (int) $r->order_count_today,
            ])
            ->all();
    }

    private function authorizeSiteAccess(Request $request, int $siteId): void
    {
        $hasAccess = Site::accessibleBy($request->user())->where('id', $siteId)->exists();
        if (!$hasAccess) {
            abort(404);
        }
    }

    /**
     * Two shapes:
     *  - summary  = compact list view (no line_items / billing_address / latest_note)
     *  - default  = inline-panel detail view
     *
     * Both include the WP-admin edit URL so the table action button can link directly.
     */
    private function serializeOrder(Order $order, bool $summary = false): array
    {
        $siteUrl = rtrim($order->site?->url ?? '', '/');
        $base = [
            'id'              => $order->id,
            'site_id'         => $order->site_id,
            'site_name'       => $order->site?->name,
            'site_url'        => $order->site?->url,
            'woo_order_id'    => $order->woo_order_id,
            'order_number'    => $order->order_number,
            'status'          => $order->status,
            'total'           => (string) $order->total,
            'currency'        => $order->currency,
            'customer_name'   => $order->customer_name,
            'customer_email'  => $order->customer_email,
            'payment_method'  => $order->payment_method,
            'payment_method_title' => $order->payment_method_title,
            'items_count'     => $order->items_count,
            'order_date'      => optional($order->order_date)->toIso8601String(),
            'synced_at'       => optional($order->synced_at)->toIso8601String(),
            'wp_admin_edit_url' => $siteUrl
                ? "{$siteUrl}/wp-admin/post.php?post={$order->woo_order_id}&action=edit"
                : null,
        ];

        if ($summary) {
            return $base;
        }

        return array_merge($base, [
            'customer_phone'  => $order->customer_phone,
            'billing_address' => $order->billing_address,
            'line_items'      => $order->line_items,
            'latest_note'     => $order->latest_note,
        ]);
    }
}
