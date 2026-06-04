<?php
if (!defined('ABSPATH')) exit;

class Epos_Agent_External_Plugin_Manager {

    public static function init() {
        // Nothing to hook for now — methods called via REST API
    }

    /**
     * Install a plugin from WordPress.org
     */
    public static function install_plugin($slug, $version, $download_url, $file_hash, $activate = true) {
        set_time_limit(300);

        // Security: only allow downloads.wordpress.org
        if (!str_starts_with($download_url, 'https://downloads.wordpress.org/')) {
            return ['success' => false, 'error' => 'Invalid download source — only downloads.wordpress.org allowed'];
        }

        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        WP_Filesystem();

        // Download
        $tmp_file = download_url($download_url);
        if (is_wp_error($tmp_file)) {
            return ['success' => false, 'error' => 'Download failed: ' . $tmp_file->get_error_message()];
        }

        // Verify hash if provided
        if ($file_hash) {
            $actual_hash = hash_file('sha256', $tmp_file);
            if ($actual_hash !== $file_hash) {
                @unlink($tmp_file);
                return ['success' => false, 'error' => 'File hash mismatch — download may be corrupted'];
            }
        }

        // Install using WordPress upgrader (silent skin)
        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        $result = $upgrader->install($tmp_file);
        @unlink($tmp_file);

        if (is_wp_error($result)) {
            return ['success' => false, 'error' => 'Install failed: ' . $result->get_error_message()];
        }
        if ($result === false) {
            return ['success' => false, 'error' => 'Installation failed'];
        }

        // Find the installed plugin file
        $plugin_file = self::find_plugin_file($slug);

        // Activate if requested
        if ($activate && $plugin_file) {
            $activated = activate_plugin($plugin_file);
            if (is_wp_error($activated)) {
                return ['success' => true, 'file' => $plugin_file, 'warning' => 'Installed but activation failed: ' . $activated->get_error_message()];
            }
        }

        return ['success' => true, 'file' => $plugin_file];
    }

    /**
     * Update a single plugin
     *
     * @param string      $slug
     * @param string      $download_url
     * @param string|null $file_hash
     * @param bool        $activate Whether to (re)activate the plugin after a
     *                              successful update. Defaults to true because
     *                              WordPress can deactivate a plugin during a
     *                              filesystem update.
     */
    public static function update_plugin($slug, $download_url, $file_hash, $activate = true) {
        set_time_limit(300);

        if (!str_starts_with($download_url, 'https://downloads.wordpress.org/')) {
            return ['success' => false, 'error' => 'Invalid download source'];
        }

        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        WP_Filesystem();

        $plugin_file = self::find_plugin_file($slug);
        if (!$plugin_file) {
            return ['success' => false, 'error' => 'Plugin not found on this site'];
        }

        // Backup current version for rollback
        $backup_path = self::backup_plugin($slug);

        // Download new version
        $tmp_file = download_url($download_url);
        if (is_wp_error($tmp_file)) {
            return ['success' => false, 'error' => 'Download failed: ' . $tmp_file->get_error_message()];
        }

        // Verify hash
        if ($file_hash) {
            $actual_hash = hash_file('sha256', $tmp_file);
            if ($actual_hash !== $file_hash) {
                @unlink($tmp_file);
                return ['success' => false, 'error' => 'File hash mismatch'];
            }
        }

        // Check if plugin was active before update
        $was_active = is_plugin_active($plugin_file);

        // Use upgrader
        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        $upgrader->skin->plugin = $plugin_file;
        $result = $upgrader->upgrade($plugin_file);

        if (is_wp_error($result)) {
            return ['success' => false, 'error' => 'Update failed: ' . $result->get_error_message()];
        }

        // upgrade() returns false on several non-fatal conditions — most
        // notably "plugin is at the latest version", which we want to treat
        // as success (the requested version is already installed or newer).
        // Pull the actual reason from the skin's upgrade-messages buffer.
        if ($result === false) {
            $skin_messages = is_callable([$upgrader->skin, 'get_upgrade_messages'])
                ? $upgrader->skin->get_upgrade_messages()
                : [];
            $reason = !empty($skin_messages) ? end($skin_messages) : 'unknown reason';

            $already_latest = stripos($reason, 'latest version') !== false;
            if (!$already_latest) {
                return ['success' => false, 'error' => 'Update failed: ' . $reason];
            }
            // Fall through to (re)activation — the install is already at
            // the requested version, so the caller's intent (have this
            // plugin active at version X) can still be satisfied.
        }

        // WordPress writes `active_plugins` during the upgrade but the
        // in-process options cache can stay warm with the pre-upgrade value,
        // so a stale is_plugin_active() can report `true` and we skip the
        // re-activation that we actually need. Bust the cache before checking.
        wp_cache_delete('alloptions', 'options');
        wp_cache_delete('active_plugins', 'options');

        $should_activate = $activate || $was_active;
        $activated       = false;
        $activation_warning = null;

        if ($should_activate) {
            if (!is_plugin_active($plugin_file)) {
                // activate_plugin() fires the plugin's `activate_*` hook in
                // this same request. Some plugins (WooCommerce being the
                // worst offender) have install-time hooks that require
                // classes only registered by the new autoloader at next
                // request boot — calling them here throws a fatal like
                // "Class \"Automattic\\WooCommerce\\Enums\\TaxBasedOn\" not found".
                //
                // Wrap the call so a fatal inside the activation hook
                // doesn't bubble out as a 500. If it throws, fall back to
                // a *deferred* activation: write the plugin into
                // `active_plugins` directly. WordPress will pick it up on
                // the next request, the autoloader will resolve fully, and
                // the install hook will run cleanly in that context.
                try {
                    $activation_result = activate_plugin($plugin_file);
                    if (is_wp_error($activation_result)) {
                        $activation_warning = 'Updated but activation failed: ' . $activation_result->get_error_message();
                    }
                } catch (\Throwable $e) {
                    $active = (array) get_option('active_plugins', []);
                    if (!in_array($plugin_file, $active, true)) {
                        $active[] = $plugin_file;
                        update_option('active_plugins', array_values(array_unique($active)));
                    }
                    $activation_warning = 'Updated; activation deferred to next request (plugin hook threw: ' . $e->getMessage() . ')';
                }
                wp_cache_delete('alloptions', 'options');
                wp_cache_delete('active_plugins', 'options');
            }
            $activated = is_plugin_active($plugin_file);
        }

        $response = [
            'success'              => true,
            'file'                 => $plugin_file,
            'activated'            => $activated,
            'was_active'           => $was_active,
            'previous_backup_path' => $backup_path,
        ];

        if ($activation_warning !== null) {
            $response['warning'] = $activation_warning;
        }

        return $response;
    }

    /**
     * Update multiple plugins in batch
     */
    public static function update_batch($plugins) {
        $results = [];
        foreach ($plugins as $plugin) {
            $results[] = [
                'slug' => $plugin['slug'],
                'result' => self::update_plugin(
                    $plugin['slug'],
                    $plugin['download_url'],
                    $plugin['file_hash'] ?? null,
                    $plugin['activate'] ?? true
                ),
            ];
        }
        return $results;
    }

    /**
     * Activate a plugin
     */
    public static function activate_plugin($slug, $file) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        $result = activate_plugin($file);
        if (is_wp_error($result)) {
            return ['success' => false, 'error' => $result->get_error_message()];
        }
        return ['success' => true];
    }

    /**
     * Deactivate a plugin
     */
    public static function deactivate_plugin($slug, $file) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        deactivate_plugins($file);
        return ['success' => true];
    }

    /**
     * Uninstall (deactivate + delete) a plugin
     */
    public static function uninstall_plugin($slug, $file) {
        set_time_limit(300);

        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        WP_Filesystem();

        // Deactivate first
        deactivate_plugins($file);

        // Delete
        $result = delete_plugins([$file]);
        if (is_wp_error($result)) {
            return ['success' => false, 'error' => 'Delete failed: ' . $result->get_error_message()];
        }
        if ($result === false) {
            return ['success' => false, 'error' => 'Delete failed'];
        }

        return ['success' => true];
    }

    /**
     * Find plugin file path by slug
     */
    private static function find_plugin_file($slug) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $all_plugins = get_plugins();
        foreach ($all_plugins as $file => $data) {
            if (explode('/', $file)[0] === $slug) {
                return $file;
            }
        }
        return null;
    }

    /**
     * Backup plugin directory for rollback
     */
    private static function backup_plugin($slug) {
        $plugin_file = self::find_plugin_file($slug);
        if (!$plugin_file) return null;

        $plugin_dir = WP_PLUGIN_DIR . '/' . explode('/', $plugin_file)[0];
        $backup_dir = WP_CONTENT_DIR . '/epos-agent-backups/wporg/' . $slug . '-' . time();

        if (is_dir($plugin_dir)) {
            self::copy_directory($plugin_dir, $backup_dir);
            update_option('epos_rollback_wporg_' . $slug, $backup_dir);
        }

        return $backup_dir;
    }

    /**
     * Recursively copy a directory
     */
    private static function copy_directory($src, $dst) {
        $dir = opendir($src);
        @mkdir($dst, 0755, true);
        while (($file = readdir($dir)) !== false) {
            if ($file === '.' || $file === '..') continue;
            if (is_dir($src . '/' . $file)) {
                self::copy_directory($src . '/' . $file, $dst . '/' . $file);
            } else {
                copy($src . '/' . $file, $dst . '/' . $file);
            }
        }
        closedir($dir);
    }
}
