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

        // Default the login customizer to on. Stored as an option so admins
        // can flip it off later from the settings page without disabling
        // the entire plugin.
        add_option('epos_login_customizer_enabled', '1');

        // Register the /epos-login rewrite rule, then flush so the new
        // route is recognized without forcing a manual permalinks re-save.
        if (class_exists('Epos_Agent_Login_Customizer')) {
            Epos_Agent_Login_Customizer::register_rewrite();
        }
        flush_rewrite_rules();

        // Attempt handshake if settings already exist
        $portal_url = get_option('epos_agent_portal_url');
        $api_key = get_option('epos_agent_api_key');

        if (!empty($portal_url) && !empty($api_key)) {
            self::perform_handshake($portal_url, $api_key);
        }
    }

    /**
     * Perform handshake with the Portal.
     *
     * @param string $portal_url
     * @param string $api_key
     * @param bool   $return_details  When true, returns an associative array
     *                                with full response details instead of a bool.
     *                                Existing callers using `if ($result)` still work
     *                                because the array is truthy on success.
     * @return bool|array
     */
    public static function perform_handshake($portal_url, $api_key, $return_details = false) {
        $site_url = get_site_url();

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
            update_option('epos_agent_last_test_at', time());
            update_option('epos_agent_last_error', $response->get_error_message());

            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[EPOS Agent] Handshake failed: ' . $response->get_error_message());
            }

            return $return_details ? [
                'success' => false,
                'code'    => 0,
                'message' => $response->get_error_message(),
                'site_url_sent' => $site_url,
            ] : false;
        }

        $code = wp_remote_retrieve_response_code($response);
        $raw  = wp_remote_retrieve_body($response);
        $data = json_decode($raw, true);

        update_option('epos_agent_last_test_at', time());

        if ($code === 200) {
            update_option('epos_agent_connection_status', 'connected');
            update_option('epos_agent_last_error', '');

            // Persist the portal-supplied list of hosts that may legitimately
            // serve plugin download URLs (e.g. a separate backend host like
            // web-backend.example.com when the portal frontend is at
            // portal.example.com). Used by class-plugin-installer.php to
            // validate incoming download_url params.
            if (!empty($data['download_hosts']) && is_array($data['download_hosts'])) {
                $hosts = array_map('strtolower', array_filter($data['download_hosts'], 'is_string'));
                update_option('epos_agent_download_hosts', implode(',', $hosts));
            }

            if ($return_details) {
                return [
                    'success' => true,
                    'code'    => 200,
                    'message' => $data['message'] ?? 'Connected.',
                    'site'    => $data['site'] ?? null,
                    'site_url_sent' => $site_url,
                ];
            }
            return true;
        }

        update_option('epos_agent_connection_status', 'error');
        $errMsg = $data['message'] ?? ('HTTP ' . $code);
        update_option('epos_agent_last_error', $errMsg);

        return $return_details ? [
            'success' => false,
            'code'    => $code,
            'message' => $errMsg,
            'site_url_sent' => $site_url,
        ] : false;
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
