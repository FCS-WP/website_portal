<?php
/**
 * Handles plugin install/update commands from the Portal.
 */
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

        if (empty($plugin_slug) || empty($version) || empty($download_url) || empty($file_hash)) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'Missing required parameters: plugin_slug, version, download_url, file_hash',
            ], 400);
        }

        // Download the plugin zip
        $tmp_file = download_url($download_url, 300);

        if (is_wp_error($tmp_file)) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'Failed to download plugin: ' . $tmp_file->get_error_message(),
            ], 500);
        }

        // Verify SHA256 hash
        $actual_hash = hash_file('sha256', $tmp_file);
        if ($actual_hash !== $file_hash) {
            @unlink($tmp_file);
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'File hash mismatch. Expected: ' . $file_hash . ', Got: ' . $actual_hash,
            ], 400);
        }

        // Install using WordPress Plugin API
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        // Use a silent skin to suppress output
        $skin = new \WP_Ajax_Upgrader_Skin();
        $upgrader = new \Plugin_Upgrader($skin);

        // Check if plugin already exists
        $plugin_dir = WP_PLUGIN_DIR . '/' . $plugin_slug;
        if (is_dir($plugin_dir)) {
            // Update existing plugin
            $result = $upgrader->install($tmp_file, ['overwrite_package' => true]);
        } else {
            // Fresh install
            $result = $upgrader->install($tmp_file);
        }

        @unlink($tmp_file);

        if (is_wp_error($result)) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'Installation failed: ' . $result->get_error_message(),
            ], 500);
        }

        if ($result === false) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'Installation failed. Check server permissions.',
            ], 500);
        }

        // Activate the plugin if not already active
        $plugin_file = $plugin_slug . '/' . $plugin_slug . '.php';
        if (!is_plugin_active($plugin_file)) {
            activate_plugin($plugin_file);
        }

        return new \WP_REST_Response([
            'success' => true,
            'message' => "Plugin {$plugin_slug} v{$version} installed successfully.",
        ], 200);
    }
}
