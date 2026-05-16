<?php
/**
 * Post-Deployment Health Check for EPOS Agent
 * Runs automated checks after plugin installation and triggers rollback on failure
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Health_Check {

    /**
     * Initialize health check hooks
     */
    public static function init() {
        add_action('epos_agent_health_check', [new self(), 'run_scheduled_check'], 10, 2);
    }

    /**
     * Schedule health checks after a successful plugin install
     * Called from class-plugin-installer.php after successful deployment
     */
    public static function schedule_checks($plugin_slug) {
        $deployment = get_option('epos_last_deployment_' . $plugin_slug);
        if (!$deployment) return;

        // Get check delays from Portal settings (passed during deployment) or use defaults
        $delay_first = intval(get_option('epos_health_check_delay', 2)) * 60; // default 2 min
        $delay_second = intval(get_option('epos_health_check_second_delay', 5)) * 60; // default 5 min

        // Schedule first check
        wp_schedule_single_event(time() + $delay_first, 'epos_agent_health_check', [$plugin_slug, 1]);
        
        // Schedule second check
        wp_schedule_single_event(time() + $delay_second, 'epos_agent_health_check', [$plugin_slug, 2]);
    }

    /**
     * Run scheduled health check (called by WP Cron)
     */
    public function run_scheduled_check($plugin_slug, $check_number) {
        $deployment = get_option('epos_last_deployment_' . $plugin_slug);
        if (!$deployment) return;

        // Check if rollback is enabled
        if (!get_option('epos_rollback_enabled', true)) {
            return;
        }

        // If already rolled back (from check 1), skip check 2
        if ($check_number === 2) {
            $current_status = get_option('epos_health_status_' . $plugin_slug);
            if ($current_status === 'rolled_back') {
                return;
            }
        }

        // Run all health checks
        $results = $this->run_checks($plugin_slug, $deployment['installed_at'] ?? 0);

        // Determine if all checks passed (ignoring null = not applicable)
        $applicable_results = array_filter($results, fn($v) => $v !== null);
        $all_passed = !in_array(false, $applicable_results, true);

        if (!$all_passed) {
            // ROLLBACK
            require_once plugin_dir_path(__FILE__) . 'class-rollback.php';
            $rollback = new Epos_Agent_Rollback();
            $rollback_success = $rollback->rollback($plugin_slug);

            update_option('epos_health_status_' . $plugin_slug, 'rolled_back');

            // Cancel second check if this is check 1
            if ($check_number === 1) {
                wp_clear_scheduled_hook('epos_agent_health_check', [$plugin_slug, 2]);
            }

            // Report to Portal
            $this->report_to_portal([
                'deployment_job_site_id' => $deployment['deployment_job_site_id'] ?? null,
                'plugin_slug' => $plugin_slug,
                'installed_version' => $deployment['installed_version'] ?? '',
                'previous_version' => $deployment['previous_version'] ?? '',
                'check_number' => $check_number,
                'status' => 'rolled_back',
                'checks' => $results,
                'error_detail' => $this->get_error_summary($results),
                'rolled_back' => true,
                'rollback_success' => $rollback_success,
            ]);
        } else {
            // HEALTHY
            update_option('epos_health_status_' . $plugin_slug, 'healthy');

            $this->report_to_portal([
                'deployment_job_site_id' => $deployment['deployment_job_site_id'] ?? null,
                'plugin_slug' => $plugin_slug,
                'installed_version' => $deployment['installed_version'] ?? '',
                'previous_version' => $deployment['previous_version'] ?? '',
                'check_number' => $check_number,
                'status' => 'healthy',
                'checks' => $results,
                'error_detail' => null,
                'rolled_back' => false,
                'rollback_success' => null,
            ]);

            // Clean up deployment tracking after second check passes
            if ($check_number === 2) {
                delete_option('epos_last_deployment_' . $plugin_slug);
                delete_option('epos_health_status_' . $plugin_slug);
            }
        }
    }

    /**
     * Run all health checks
     */
    private function run_checks($plugin_slug, $install_timestamp) {
        return [
            'site_reachable' => $this->check_site_reachable(),
            'wp_admin_reachable' => $this->check_wp_admin_reachable(),
            'no_fatal_errors' => $this->check_no_fatal_errors($install_timestamp),
            'woo_checkout_reachable' => class_exists('WooCommerce') ? $this->check_woo_checkout() : null,
            'plugin_active' => $this->check_plugin_active($plugin_slug),
        ];
    }

    /**
     * Check 1: Site homepage is reachable
     */
    private function check_site_reachable() {
        $response = wp_remote_get(home_url('/'), [
            'timeout' => 10,
            'sslverify' => false,
            'redirection' => 3,
        ]);

        if (is_wp_error($response)) return false;
        
        $code = wp_remote_retrieve_response_code($response);
        return ($code >= 200 && $code < 400);
    }

    /**
     * Check 2: WP Admin is reachable
     */
    private function check_wp_admin_reachable() {
        $response = wp_remote_get(admin_url('index.php'), [
            'timeout' => 10,
            'sslverify' => false,
            'redirection' => 0, // Don't follow redirects
        ]);

        if (is_wp_error($response)) return false;
        
        $code = wp_remote_retrieve_response_code($response);
        // 200 = direct access, 302 = redirect to login (both OK)
        return in_array($code, [200, 301, 302, 303]);
    }

    /**
     * Check 3: No PHP fatal errors in debug.log since installation
     */
    private function check_no_fatal_errors($install_timestamp) {
        $debug_log = WP_CONTENT_DIR . '/debug.log';
        
        if (!file_exists($debug_log)) {
            return true; // No log file = no errors
        }

        // Read last 50 lines
        $lines = $this->tail($debug_log, 50);
        
        foreach ($lines as $line) {
            // Check if line contains fatal error
            if (preg_match('/Fatal error|PHP Fatal/i', $line)) {
                // Try to extract timestamp from log line
                // WordPress debug.log format: [DD-Mon-YYYY HH:MM:SS UTC]
                if (preg_match('/\[(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2})/i', $line, $matches)) {
                    $error_time = strtotime($matches[1]);
                    if ($error_time && $error_time >= $install_timestamp) {
                        return false; // Fatal error after installation
                    }
                } else {
                    // Can't parse timestamp, assume it's recent
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Check 4: WooCommerce checkout page is accessible
     */
    private function check_woo_checkout() {
        $checkout_url = function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : home_url('/checkout/');
        
        $response = wp_remote_get($checkout_url, [
            'timeout' => 10,
            'sslverify' => false,
            'redirection' => 3,
        ]);

        if (is_wp_error($response)) return false;
        
        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        // Should not be 500 and should not contain WP error
        if ($code >= 500) return false;
        if (strpos($body, 'wp-die-message') !== false) return false;
        
        return true;
    }

    /**
     * Check 5: Plugin is still active
     */
    private function check_plugin_active($plugin_slug) {
        if (!function_exists('is_plugin_active')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $plugins = get_plugins();
        foreach ($plugins as $file => $data) {
            if (strpos($file, $plugin_slug . '/') === 0) {
                return is_plugin_active($file);
            }
        }

        return false; // Plugin not found at all
    }

    /**
     * Report health check results to Portal
     */
    private function report_to_portal($data) {
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key) || empty($data['deployment_job_site_id'])) {
            error_log('[EPOS Agent] Health report skipped: missing portal URL, API key, or deployment ID');
            return false;
        }

        $endpoint = rtrim($portal_url, '/') . '/api/agent/deployment/health-report';

        $response = wp_remote_post($endpoint, [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'X-Agent-Key' => $api_key,
                'X-Site-Url' => get_site_url(),
            ],
            'body' => json_encode($data),
        ]);

        if (is_wp_error($response)) {
            error_log('[EPOS Agent] Health report failed: ' . $response->get_error_message());
            return false;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            error_log('[EPOS Agent] Health report failed (HTTP ' . $code . '): ' . wp_remote_retrieve_body($response));
            return false;
        }

        return true;
    }

    /**
     * Get human-readable error summary from check results
     */
    private function get_error_summary($results) {
        $failures = [];
        $labels = [
            'site_reachable' => 'Site homepage unreachable',
            'wp_admin_reachable' => 'WP Admin unreachable',
            'no_fatal_errors' => 'PHP Fatal error detected in debug.log',
            'woo_checkout_reachable' => 'WooCommerce checkout page error',
            'plugin_active' => 'Plugin deactivated after installation',
        ];

        foreach ($results as $check => $passed) {
            if ($passed === false) {
                $failures[] = $labels[$check] ?? $check;
            }
        }

        return implode('; ', $failures);
    }

    /**
     * Read last N lines of a file efficiently
     */
    private function tail($filepath, $lines = 50) {
        $file = new SplFileObject($filepath, 'r');
        $file->seek(PHP_INT_MAX);
        $total_lines = $file->key();
        
        $start = max(0, $total_lines - $lines);
        $result = [];
        
        $file->seek($start);
        while (!$file->eof()) {
            $line = $file->current();
            if (trim($line) !== '') {
                $result[] = $line;
            }
            $file->next();
        }

        return $result;
    }
}
