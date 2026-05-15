<?php
/**
 * Fired during plugin activation.
 */
class Epos_Agent_Activator {

    /**
     * Activate the plugin.
     * - Schedule the cron ping
     * - Trigger initial handshake with Portal
     */
    public static function activate() {
        // Schedule the 5-minute ping cron
        if (!wp_next_scheduled('epos_agent_ping_hook')) {
            wp_schedule_event(time(), 'every_five_minutes', 'epos_agent_ping_hook');
        }

        // Set default options
        add_option('epos_agent_portal_url', '');
        add_option('epos_agent_api_key', '');
        add_option('epos_agent_connection_status', 'pending');

        // Attempt handshake if settings already exist
        $portal_url = get_option('epos_agent_portal_url');
        $api_key = get_option('epos_agent_api_key');

        if (!empty($portal_url) && !empty($api_key)) {
            self::perform_handshake($portal_url, $api_key);
        }
    }

    /**
     * Perform handshake with the Portal
     */
    public static function perform_handshake($portal_url, $api_key) {
        $site_url = get_site_url();
        
        // Gather site information
        $body = [
            'wp_version'      => get_bloginfo('version'),
            'php_version'     => phpversion(),
            'woo_active'      => class_exists('WooCommerce'),
            'company_plugins' => self::get_epos_plugins(),
        ];

        $response = wp_remote_post(
            rtrim($portal_url, '/') . '/api/agent/handshake',
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
                error_log('[EPOS Agent] Handshake failed: ' . $response->get_error_message());
            }
            return false;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code === 200) {
            update_option('epos_agent_connection_status', 'connected');
            return true;
        }

        update_option('epos_agent_connection_status', 'error');
        return false;
    }

    /**
     * Get list of EPOS company plugins installed on this site
     */
    public static function get_epos_plugins() {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $all_plugins = get_plugins();
        $active_plugins = get_option('active_plugins', []);
        $epos_plugins = [];

        foreach ($all_plugins as $plugin_file => $plugin_data) {
            // Only include plugins with 'epos-' prefix in their directory
            $slug = dirname($plugin_file);
            if (strpos($slug, 'epos-') === 0) {
                $epos_plugins[] = [
                    'slug'    => $slug,
                    'version' => $plugin_data['Version'],
                    'active'  => in_array($plugin_file, $active_plugins),
                ];
            }
        }

        return $epos_plugins;
    }
}
