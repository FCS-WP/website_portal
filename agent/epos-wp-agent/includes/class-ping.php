<?php
/**
 * Handles the periodic heartbeat ping to the Portal.
 */
class Epos_Agent_Ping {

    public static function init() {
        // Register custom cron interval
        add_filter('cron_schedules', [self::class, 'add_cron_interval']);
        
        // Register the cron action
        add_action('epos_agent_ping_hook', [self::class, 'run']);
    }

    /**
     * Add custom 5-minute interval to WP cron
     */
    public static function add_cron_interval($schedules) {
        $schedules['every_five_minutes'] = [
            'interval' => 300,
            'display'  => esc_html__('Every 5 Minutes', 'epos-wp-agent'),
        ];
        return $schedules;
    }

    /**
     * Execute the ping to Portal
     */
    public static function run() {
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key)) {
            return;
        }

        $site_url = get_site_url();

        // Gather data to send
        $body = [
            'company_plugins' => Epos_Agent_Activator::get_epos_plugins(),
        ];

        // Include order data if WooCommerce is active
        if (class_exists('WooCommerce')) {
            $order_sync = new Epos_Agent_Order_Sync();
            $body['orders'] = $order_sync->get_recent_orders();
        }

        // Include security data
        $body['security'] = [
            'login_events'    => Epos_Agent_Security_Login_Monitor::flush_buffer(),
            'baseline_exists' => !empty(get_option('epos_agent_file_baseline', '')),
            'admin_count'     => count(get_users(['role' => 'administrator'])),
        ];

        $response = wp_remote_post(
            rtrim($portal_url, '/') . '/api/agent/ping',
            [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Agent-Key'  => $api_key,
                    'X-Site-Url'   => $site_url,
                ],
                'body'    => wp_json_encode($body),
                'timeout' => 30,
                'sslverify' => true,
            ]
        );

        if (is_wp_error($response)) {
            update_option('epos_agent_connection_status', 'error');
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[EPOS Agent] Ping failed: ' . $response->get_error_message());
            }
            return;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code === 200) {
            update_option('epos_agent_connection_status', 'connected');
        } else {
            update_option('epos_agent_connection_status', 'error');
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[EPOS Agent] Ping returned HTTP ' . $code);
            }
        }
    }
}
