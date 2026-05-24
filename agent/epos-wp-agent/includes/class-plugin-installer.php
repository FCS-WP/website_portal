<?php
/**
 * EPOS WP Agent - Plugin Installer
 * Handles plugin install/update commands pushed from the Portal.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Epos_Agent_Plugin_Installer {

    /**
     * Install or update a plugin from the Portal
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public function install($request) {
        $plugin_slug  = sanitize_text_field($request->get_param('plugin_slug'));
        $version      = sanitize_text_field($request->get_param('version'));
        $download_url = esc_url_raw($request->get_param('download_url'));
        $file_hash    = sanitize_text_field($request->get_param('file_hash'));

        // Store health check / rollback settings from Portal
        if ($request->get_param('health_check_delay') !== null) {
            update_option('epos_health_check_delay', intval($request->get_param('health_check_delay')));
        }
        if ($request->get_param('health_check_second_delay') !== null) {
            update_option('epos_health_check_second_delay', intval($request->get_param('health_check_second_delay')));
        }
        if ($request->get_param('rollback_enabled') !== null) {
            update_option('epos_rollback_enabled', (bool) $request->get_param('rollback_enabled'));
        }

        if (empty($plugin_slug) || empty($version) || empty($download_url)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Missing required parameters: plugin_slug, version, download_url',
            ), 400);
        }

        // Download the plugin zip
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        // Allow downloads from the registered portal URL plus any hosts
        // the portal pushes via epos_agent_download_hosts. Covers split
        // frontend/backend deployments (e.g. portal.x.com + web-backend.x.com).
        $portal_url     = get_option('epos_agent_portal_url', '');
        $extra_hosts    = get_option('epos_agent_download_hosts', '');
        $allowed_hosts  = array();

        if (!empty($portal_url)) {
            $h = parse_url($portal_url, PHP_URL_HOST);
            if ($h) {
                $allowed_hosts[] = strtolower($h);
            }
        }
        if (!empty($extra_hosts)) {
            foreach (explode(',', $extra_hosts) as $h) {
                $h = strtolower(trim($h));
                if ($h !== '') {
                    $allowed_hosts[] = $h;
                }
            }
        }
        $allowed_hosts = array_values(array_unique($allowed_hosts));

        $download_domain = strtolower((string) parse_url($download_url, PHP_URL_HOST));

        if (!empty($allowed_hosts) && !in_array($download_domain, $allowed_hosts, true)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Download URL host not allowed. Allowed: ' . implode(', ', $allowed_hosts) . '. Got: ' . $download_domain,
            ), 403);
        }

        // Use wp_remote_get (not download_url/wp_safe_remote_get) to avoid
        // WordPress SSRF protection blocking private/local IPs in dev environments
        $response = wp_remote_get($download_url, array(
            'timeout' => 300,
            'stream'  => true,
            'filename' => wp_tempnam($download_url),
        ));

        if (is_wp_error($response)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Failed to download plugin: ' . $response->get_error_message(),
            ), 500);
        }

        $response_code = wp_remote_retrieve_response_code($response);
        if ($response_code !== 200) {
            @unlink($response['filename']);
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Failed to download plugin: HTTP ' . $response_code,
            ), 500);
        }

        $tmp_file = $response['filename'];

        // Verify SHA256 hash if provided
        if (!empty($file_hash)) {
            $actual_hash = hash_file('sha256', $tmp_file);
            if ($actual_hash !== $file_hash) {
                @unlink($tmp_file);
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => 'File hash mismatch. Expected: ' . $file_hash . ', Got: ' . $actual_hash,
                ), 422);
            }
        }

        // Backup current version before upgrading
        require_once plugin_dir_path(__FILE__) . 'class-rollback.php';
        $rollback = new Epos_Agent_Rollback();
        $rollback->backup_current_version($plugin_slug);

        // Resolve the plugin's entry file. The earlier convention of
        // "{slug}/{slug}.php" works for most company plugins (zippy-crm
        // points at zippy-crm/zippy-crm.php) but breaks for the agent
        // itself, whose entry is wp-portal-agent/epos-wp-agent.php. We
        // probe get_plugins() to find the real entry under the slug dir.
        $plugin_dir  = WP_PLUGIN_DIR . '/' . $plugin_slug;
        $plugin_file = self::resolve_plugin_file($plugin_slug)
            ?? ($plugin_slug . '/' . $plugin_slug . '.php'); // fallback to old convention
        $was_active  = false;

        // Detect self-update: are we being asked to overwrite ourselves?
        // Compare against EPOS_AGENT_PLUGIN_BASENAME (e.g. "wp-portal-agent/epos-wp-agent.php")
        // — the slug is the directory portion before the slash.
        $is_self_update = defined('EPOS_AGENT_PLUGIN_BASENAME')
            && strpos(EPOS_AGENT_PLUGIN_BASENAME, $plugin_slug . '/') === 0;

        if (is_dir($plugin_dir)) {
            $was_active = is_plugin_active($plugin_file);

            // Use WP_Upgrader with overwrite to handle update
            $skin = new WP_Ajax_Upgrader_Skin();
            $upgrader = new Plugin_Upgrader($skin);
            $result = $upgrader->install($tmp_file, array('overwrite_package' => true));
        } else {
            // Fresh install
            $skin = new WP_Ajax_Upgrader_Skin();
            $upgrader = new Plugin_Upgrader($skin);
            $result = $upgrader->install($tmp_file);
        }

        @unlink($tmp_file);

        if (is_wp_error($result)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Installation failed: ' . $result->get_error_message(),
            ), 500);
        }

        if ($result === false) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => 'Installation failed. Check server permissions.',
            ), 500);
        }

        // After overwrite, the entry file may have moved (e.g. the new
        // version renamed its bootstrap). Re-resolve so subsequent
        // activate_plugin() targets the correct file.
        $plugin_file = self::resolve_plugin_file($plugin_slug) ?? $plugin_file;

        // Activate the plugin if it was previously active or is a fresh install.
        //
        // Self-update guard: when the slug IS the agent itself and it was
        // already active, skip activate_plugin(). The overwrite kept the
        // plugin in active_plugins; calling the new file's activation hook
        // inside this same request would `require` new code on top of the
        // old classes that PHP already has in memory, producing a fatal
        // "cannot redeclare class" error. The next request will load the
        // new code cleanly via WordPress's normal plugin loader.
        $should_activate = ($was_active || !is_dir($plugin_dir));
        if ($should_activate && !($is_self_update && $was_active)) {
            if (!is_plugin_active($plugin_file)) {
                activate_plugin($plugin_file);
            }
        }

        // Store deployment context for health checks
        $deployment_job_site_id = $request->get_param('deployment_job_site_id');
        if ($deployment_job_site_id) {
            update_option('epos_last_deployment_' . $plugin_slug, [
                'deployment_job_site_id' => $deployment_job_site_id,
                'installed_version' => $version,
                'previous_version' => $rollback->get_backup_version($plugin_slug),
                'installed_at' => time(),
            ]);

            // Schedule post-deployment health checks
            require_once plugin_dir_path(__FILE__) . 'class-health-check.php';
            Epos_Agent_Health_Check::schedule_checks($plugin_slug);
        }

        return new WP_REST_Response(array(
            'success' => true,
            'message' => "Plugin {$plugin_slug} v{$version} installed successfully.",
            'data' => array(
                'slug' => $plugin_slug,
                'version' => $version,
                'was_active' => $was_active,
                'is_self_update' => $is_self_update,
            ),
        ), 200);
    }

    /**
     * Resolve the bootstrap PHP file for a plugin directory.
     *
     * Plugin slugs (directory names) don't always match the entry-file
     * name. Examples: "wp-portal-agent/epos-wp-agent.php" — directory
     * "wp-portal-agent", entry "epos-wp-agent.php". get_plugins() walks
     * every registered plugin and reads the header; we pick the one
     * inside our slug's directory.
     *
     * Returns the relative plugin file path ("slug/entry.php") on success,
     * null when no plugin under that directory is registered with WP.
     */
    private static function resolve_plugin_file(string $plugin_slug): ?string {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $needle = $plugin_slug . '/';
        foreach (get_plugins() as $file => $_data) {
            if (strpos($file, $needle) === 0) {
                return $file;
            }
        }
        return null;
    }
}
