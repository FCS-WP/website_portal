<?php
/**
 * Handles WooCommerce order data collection for sync to Portal.
 *
 * Phase 7 (Module 24, PRD §7.2): syncs the 200 most recent orders modified
 * since the last successful sync, capped at 50 per ping. The Portal stores
 * up to 200 per site; older rows are pruned on each ingest.
 *
 * Sync state is tracked in wp_options:
 *   epos_agent_orders_last_sync — unix timestamp set on first sync
 *
 * The previous incarnation of this class returned a flat array; the Portal
 * now expects a wrapped envelope so it can negotiate sync state. See
 * get_sync_payload().
 */
class Epos_Agent_Order_Sync {

    /** Soft cap to keep ping payloads small; Portal catches up on next ping. */
    const ORDERS_PER_PING = 50;

    /**
     * Build the `orders` block for the ping payload.
     * Returns null when WooCommerce isn't active so the ping handler can
     * omit the block entirely.
     *
     * @return array|null
     */
    public function get_sync_payload() {
        if (!class_exists('WooCommerce') || !function_exists('wc_get_orders')) {
            return null;
        }

        $last_sync = (int) get_option('epos_agent_orders_last_sync', 0);

        return [
            'last_sync_timestamp' => $last_sync,
            'orders' => $this->get_orders_for_sync($last_sync),
        ];
    }

    /**
     * Fetch orders modified since the given timestamp. When no last-sync is
     * recorded yet, returns the 50 most recent orders so the Portal can warm up.
     *
     * @param int $last_sync_timestamp Unix timestamp; 0 for first sync.
     * @return array
     */
    public function get_orders_for_sync($last_sync_timestamp) {
        $args = [
            // Constrain to actual shop orders — wc_get_orders() with no `type`
            // also returns refund objects (a different class missing
            // get_order_number()).
            'type'    => 'shop_order',
            'limit'   => self::ORDERS_PER_PING,
            'orderby' => 'date',
            'order'   => 'DESC',
            'return'  => 'objects',
        ];

        if ($last_sync_timestamp > 0) {
            // WC accepts a string comparison; '>' restricts to strictly newer.
            $args['date_modified'] = '>' . gmdate('Y-m-d H:i:s', $last_sync_timestamp);
        }

        $orders = wc_get_orders($args);
        $result = [];

        foreach ($orders as $order) {
            // Defensive: in case a future WC release still leaks non-order
            // objects through with type=shop_order, skip anything that
            // doesn't look like a WC_Order.
            if (!method_exists($order, 'get_order_number')) {
                continue;
            }
            $result[] = $this->serialize_order($order);
        }

        return $result;
    }

    /**
     * Called by the Portal-acknowledgement path in class-ping.php after the
     * ping returns. Marks now() as the new last-sync watermark so the next
     * ping only sends deltas.
     */
    public function mark_synced() {
        update_option('epos_agent_orders_last_sync', time());
    }

    /**
     * Serialize a single WC_Order into the PRD §7.2 shape.
     */
    private function serialize_order($order) {
        $items = [];
        foreach ($order->get_items() as $item) {
            $items[] = [
                'name'  => $item->get_name(),
                'qty'   => (int) $item->get_quantity(),
                'total' => function_exists('wc_format_decimal')
                    ? wc_format_decimal($item->get_total(), 2)
                    : number_format((float) $item->get_total(), 2, '.', ''),
            ];
        }

        $latest_note = null;
        if (function_exists('wc_get_order_notes')) {
            $notes = wc_get_order_notes(['order_id' => $order->get_id(), 'limit' => 1]);
            if (!empty($notes) && isset($notes[0]->content)) {
                $latest_note = $notes[0]->content;
            }
        }

        $billing_address = method_exists($order, 'get_formatted_billing_address')
            ? $order->get_formatted_billing_address()
            : null;

        $created = $order->get_date_created();

        return [
            'woo_order_id'         => $order->get_id(),
            'order_number'         => (string) $order->get_order_number(),
            'status'               => $order->get_status(),
            'total'                => (string) $order->get_total(),
            'currency'             => $order->get_currency(),
            'customer_name'        => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
            'customer_email'       => $order->get_billing_email() ?: null,
            'customer_phone'       => $order->get_billing_phone() ?: null,
            'billing_address'      => $billing_address ?: null,
            'payment_method'       => $order->get_payment_method() ?: null,
            'payment_method_title' => $order->get_payment_method_title() ?: null,
            'line_items'           => $items,
            'items_count'          => count($items),
            'latest_note'          => $latest_note,
            'order_date'           => $created ? $created->format('c') : null,
        ];
    }

    /**
     * Backward-compatible shim. The Portal previously consumed a flat array
     * from get_recent_orders(); keep it returning the same shape so any
     * other code path that still calls it doesn't break, but route the new
     * ping through get_sync_payload().
     *
     * @return array
     */
    public function get_recent_orders() {
        $payload = $this->get_sync_payload();
        return $payload ? ($payload['orders'] ?? []) : [];
    }
}
