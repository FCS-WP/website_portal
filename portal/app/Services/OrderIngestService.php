<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderSpikeAlert;
use App\Models\PortalSetting;
use App\Models\Site;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Ingests order payloads from the WP agent and enforces the per-site cap.
 *
 * Phase 7 — Module 24 (sync), Module 26 (spike alerts).
 *
 * The agent posts `orders` as `{ last_sync_timestamp, orders: [...] }`. This
 * service upserts those rows keyed on (site_id, woo_order_id), trims each
 * site back to the configured cap, then evaluates the two spike rules with a
 * 60-minute cooldown.
 */
class OrderIngestService
{
    /** Default cap if portal_settings.orders_per_site_limit is missing. */
    private const DEFAULT_PER_SITE_LIMIT = 200;

    /** Cooldown between spike alerts for a given site (PRD §5.3). */
    private const COOLDOWN_MINUTES = 60;

    /**
     * Ingest one ping's worth of order data for a site.
     *
     * @param  array $payload  Either the wrapped envelope from the new agent
     *                         ({ last_sync_timestamp, orders: [...] }) or a
     *                         bare list of orders from the legacy agent. We
     *                         accept both so a partial rollout doesn't drop data.
     * @return int             Number of orders accepted (upserted).
     */
    public function ingest(Site $site, array $payload): int
    {
        $orders = $this->extractOrders($payload);
        if (empty($orders)) {
            return 0;
        }

        $now = now();
        $accepted = 0;

        DB::transaction(function () use ($site, $orders, $now, &$accepted) {
            foreach ($orders as $row) {
                if (empty($row['woo_order_id'])) {
                    continue;
                }
                Order::updateOrCreate(
                    [
                        'site_id'      => $site->id,
                        'woo_order_id' => (int) $row['woo_order_id'],
                    ],
                    $this->normalizeOrderRow($row, $now)
                );
                $accepted++;
            }

            $this->pruneToLimit($site);
        });

        // Spike detection runs outside the transaction so a failure here
        // never blocks the ingest itself.
        if ($accepted > 0) {
            $this->evaluateSpikes($site);
        }

        return $accepted;
    }

    /**
     * Accept both the new wrapped envelope and the legacy flat array.
     */
    private function extractOrders(array $payload): array
    {
        if (array_key_exists('orders', $payload) && is_array($payload['orders'])) {
            return $payload['orders'];
        }
        // Legacy agent sent a flat list.
        return array_is_list($payload) ? $payload : [];
    }

    /**
     * Coerce a raw order row from the agent into our column shape.
     */
    private function normalizeOrderRow(array $row, Carbon $now): array
    {
        return [
            'order_number'         => $row['order_number'] ?? null,
            'status'               => $row['status'] ?? 'pending',
            'total'                => isset($row['total']) ? (float) $row['total'] : 0,
            'currency'             => $row['currency'] ?? 'USD',
            'customer_name'        => $this->trimOrNull($row['customer_name'] ?? null),
            'customer_email'       => $row['customer_email'] ?? null,
            'customer_phone'       => $row['customer_phone'] ?? null,
            'billing_address'      => $row['billing_address'] ?? null,
            'payment_method'       => $row['payment_method'] ?? null,
            'payment_method_title' => $row['payment_method_title'] ?? null,
            'line_items'           => isset($row['line_items']) && is_array($row['line_items']) ? $row['line_items'] : [],
            'items_count'          => (int) ($row['items_count'] ?? (isset($row['line_items']) ? count($row['line_items']) : 0)),
            'latest_note'          => $row['latest_note'] ?? null,
            'order_date'           => $this->parseDate($row['order_date'] ?? null) ?? $now,
            'synced_at'            => $now,
        ];
    }

    private function trimOrNull(?string $v): ?string
    {
        if ($v === null) return null;
        $t = trim($v);
        return $t === '' ? null : $t;
    }

    private function parseDate(?string $v): ?Carbon
    {
        if (empty($v)) return null;
        try {
            return Carbon::parse($v);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Keep only the N most recent orders per site (by order_date).
     * Uses a subquery so the operation is one DELETE on Postgres.
     */
    private function pruneToLimit(Site $site): void
    {
        $limit = (int) PortalSetting::where('key', 'orders_per_site_limit')->value('value')
            ?: self::DEFAULT_PER_SITE_LIMIT;

        $keepIds = Order::where('site_id', $site->id)
            ->orderByDesc('order_date')
            ->limit($limit)
            ->pluck('id');

        if ($keepIds->count() < $limit) {
            return; // Nothing to prune yet.
        }

        Order::where('site_id', $site->id)
            ->whereNotIn('id', $keepIds)
            ->delete();
    }

    /**
     * Evaluate the two PRD §5.2 rules and fire Telegram if a threshold is hit
     * and the 60-minute cooldown has elapsed.
     */
    private function evaluateSpikes(Site $site): void
    {
        if (PortalSetting::where('key', 'order_spike_enabled')->value('value') !== 'true') {
            return;
        }

        // Burst (15 min) is the more urgent of the two — evaluate it first
        // so a single ping that trips both ends up reporting the burst.
        $burstThreshold = (int) PortalSetting::where('key', 'order_spike_threshold_burst')->value('value') ?: 20;
        $hourlyThreshold = (int) PortalSetting::where('key', 'order_spike_threshold_hourly')->value('value') ?: 50;

        $burstCount = Order::where('site_id', $site->id)
            ->where('order_date', '>=', now()->subMinutes(15))
            ->count();

        if ($burstCount > $burstThreshold && $this->canAlert($site, 'burst')) {
            $this->fireAlert($site, 'burst', $burstCount, $burstThreshold, 15);
            return;
        }

        $hourlyCount = Order::where('site_id', $site->id)
            ->where('order_date', '>=', now()->subHour())
            ->count();

        if ($hourlyCount > $hourlyThreshold && $this->canAlert($site, 'hourly_spike')) {
            $this->fireAlert($site, 'hourly_spike', $hourlyCount, $hourlyThreshold, 60);
        }
    }

    private function canAlert(Site $site, string $type): bool
    {
        return !OrderSpikeAlert::where('site_id', $site->id)
            ->where('alert_type', $type)
            ->where('created_at', '>=', now()->subMinutes(self::COOLDOWN_MINUTES))
            ->exists();
    }

    private function fireAlert(Site $site, string $type, int $count, int $threshold, int $windowMinutes): void
    {
        $alert = OrderSpikeAlert::create([
            'site_id' => $site->id,
            'alert_type' => $type,
            'order_count' => $count,
            'threshold' => $threshold,
            'window_minutes' => $windowMinutes,
        ]);

        $message = $this->renderAlertMessage($site, $type, $count, $threshold);

        try {
            TelegramNotificationService::notifyAdminChannel($message);
            $alert->update(['telegram_sent' => true, 'telegram_sent_at' => now()]);
        } catch (\Throwable $e) {
            // Logged inside Telegram service. Leave telegram_sent=false so we
            // can identify undelivered alerts later.
        }
    }

    private function renderAlertMessage(Site $site, string $type, int $count, int $threshold): string
    {
        $portalBase = rtrim((string) (PortalSetting::where('key', 'portal_base_url')->value('value') ?? ''), '/');
        $siteLink = $portalBase !== '' ? "{$portalBase}/sites/{$site->id}/orders" : "Site #{$site->id}";

        if ($type === 'burst') {
            return "*Order burst — {$site->name}*\n"
                . "Orders in the last 15 minutes: {$count} (threshold: {$threshold})\n"
                . "This may indicate a flash sale or unusual bot activity.\n"
                . "→ {$siteLink}";
        }

        return "*Order spike — {$site->name}*\n"
            . "Orders in the last hour: {$count} (threshold: {$threshold})\n"
            . "Site may need attention: server load, inventory, support queue.\n"
            . "→ {$siteLink}";
    }
}
