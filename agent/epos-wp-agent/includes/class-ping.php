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
     * Detect whether a 2FA plugin is active and return its status.
     */
    private static function detect_2fa_status() {
        $two_fa_plugins = [
            'wp-2fa/wp-2fa.php'                          => ['name' => 'WP 2FA', 'method' => 'totp'],
            'two-factor/two-factor.php'                  => ['name' => 'Two Factor', 'method' => 'totp'],
            'google-authenticator/google-authenticator.php' => ['name' => 'Google Authenticator', 'method' => 'totp'],
            'wordfence/wordfence.php'                    => ['name' => 'Wordfence', 'method' => 'totp'],
        ];

        if (!function_exists('is_plugin_active')) {
            include_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        foreach ($two_fa_plugins as $plugin_path => $info) {
            if (is_plugin_active($plugin_path)) {
                return [
                    'enabled' => true,
                    'method'  => $info['method'],
                    'plugin'  => $info['name'],
                ];
            }
        }

        return [
            'enabled' => false,
            'method'  => null,
            'plugin'  => null,
        ];
    }

    /**
     * Get all installed plugins with metadata
     */
    public static function get_all_installed_plugins() {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $all_plugins = get_plugins();
        $active = get_option('active_plugins', []);
        $result = [];

        foreach ($all_plugins as $file => $data) {
            $slug = explode('/', $file)[0];
            $result[] = [
                'slug'              => $slug,
                'name'              => $data['Name'],
                'version'           => $data['Version'],
                'file'              => $file,
                'is_active'         => in_array($file, $active),
                'is_network_active' => function_exists('is_plugin_active_for_network') ? is_plugin_active_for_network($file) : false,
            ];
        }
        return $result;
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
            'all_plugins'     => self::get_all_installed_plugins(),
        ];

        // Include order data if WooCommerce is active. PRD §7.2 wraps the
        // payload as { last_sync_timestamp, orders: [...] } so the Portal
        // can negotiate delta sync. We mark_synced() only after the ping
        // returns 200, so a failed ping retries the same delta.
        $order_sync = class_exists('WooCommerce') ? new Epos_Agent_Order_Sync() : null;
        if ($order_sync) {
            $payload = $order_sync->get_sync_payload();
            if ($payload !== null) {
                $body['orders'] = $payload;
            }
        }

        // Include security data
        $body['security'] = [
            'login_events'    => Epos_Agent_Security_Login_Monitor::flush_buffer(),
            'baseline_exists' => !empty(get_option('epos_agent_file_baseline', '')),
            'admin_count'     => count(get_users(['role' => 'administrator'])),
        ];

        // Include 2FA status
        $body['two_fa'] = self::detect_2fa_status();

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
            // Advance the order-sync watermark only on a successful ping so a
            // failed ping retries the same delta next round.
            if ($order_sync) {
                $order_sync->mark_synced();
            }

            // Refresh download-host allow-list each ping so portal_base_url
            // changes propagate within one cycle.
            $body_raw = wp_remote_retrieve_body($response);
            $body_json = json_decode($body_raw, true);
            if (!empty($body_json['download_hosts']) && is_array($body_json['download_hosts'])) {
                $hosts = array_map('strtolower', array_filter($body_json['download_hosts'], 'is_string'));
                update_option('epos_agent_download_hosts', implode(',', $hosts));
            }
        } else {
            update_option('epos_agent_connection_status', 'error');
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[EPOS Agent] Ping returned HTTP ' . $code);
            }
        }
    }
}
