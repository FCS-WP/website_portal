<?php
/**
 * Handles WooCommerce order data collection for sync to Portal.
 */
class Epos_Agent_Order_Sync {

    /**
     * Get recent orders for syncing to Portal
     * Returns last 20 orders modified since last sync
     *
     * @return array
     */
    public function get_recent_orders() {
        if (!class_exists('WooCommerce') || !function_exists('wc_get_orders')) {
            return [];
        }

        $last_sync = get_option('epos_agent_last_order_sync', '2000-01-01 00:00:00');

        $orders = wc_get_orders([
            'limit'        => 20,
            'orderby'      => 'date',
            'order'        => 'DESC',
            'date_modified' => '>' . strtotime($last_sync),
        ]);

        $order_data = [];

        foreach ($orders as $order) {
            $order_data[] = [
                'woo_order_id'   => $order->get_id(),
                'order_number'   => $order->get_order_number(),
                'status'         => $order->get_status(),
                'total'          => $order->get_total(),
                'currency'       => $order->get_currency(),
                'customer_name'  => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
                'customer_email' => $order->get_billing_email(),
                'items_count'    => $order->get_item_count(),
                'order_date'     => $order->get_date_created() ? $order->get_date_created()->format('Y-m-d H:i:s') : null,
            ];
        }

        // Update last sync time
        update_option('epos_agent_last_order_sync', current_time('mysql'));

        return $order_data;
    }
}
