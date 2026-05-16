<?php
/**
 * Plugin Rollback Handler for EPOS Agent
 * Manages version backup and rollback for deployed plugins
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Rollback {

    /**
     * Backup the current version of a plugin before upgrading
     */
    public function backup_current_version($plugin_slug) {
        $plugin_dir = WP_PLUGIN_DIR . '/' . $plugin_slug;
        
        if (!is_dir($plugin_dir)) {
            return false; // Plugin not installed yet, nothing to backup
        }

        $backup_base = WP_CONTENT_DIR . '/epos-agent-backups';
        $backup_dir = $backup_base . '/' . $plugin_slug;

        // Create backup directory
        if (!is_dir($backup_base)) {
            wp_mkdir_p($backup_base);
            // Protect with .htaccess
            file_put_contents($backup_base . '/.htaccess', "Order deny,allow\nDeny from all\n");
        }

        // Remove old backup if exists
        if (is_dir($backup_dir)) {
            $this->remove_dir($backup_dir);
        }

        // Copy plugin directory to backup
        $this->copy_dir($plugin_dir, $backup_dir);

        // Store backup path and current version in wp_options
        update_option('epos_rollback_' . $plugin_slug, $backup_dir);
        
        // Get current version from plugin headers
        $plugin_file = $this->find_plugin_file($plugin_slug);
        if ($plugin_file) {
            $plugin_data = get_plugin_data(WP_PLUGIN_DIR . '/' . $plugin_file);
            update_option('epos_rollback_version_' . $plugin_slug, $plugin_data['Version'] ?? 'unknown');
        }

        // Schedule cleanup after 24 hours (will be extended if rollback occurs)
        wp_schedule_single_event(time() + 86400, 'epos_agent_cleanup_backup', [$plugin_slug]);

        return true;
    }

    /**
     * Rollback a plugin to its backed-up version
     */
    public function rollback($plugin_slug) {
        $backup_path = get_option('epos_rollback_' . $plugin_slug);

        if (!$backup_path || !is_dir($backup_path)) {
            error_log('[EPOS Agent] Rollback failed: No backup found for ' . $plugin_slug);
            return false;
        }

        $plugin_dir = WP_PLUGIN_DIR . '/' . $plugin_slug;

        // Check if plugin was active
        $plugin_file = $this->find_plugin_file($plugin_slug);
        $was_active = $plugin_file ? is_plugin_active($plugin_file) : false;

        // Remove current (broken) version
        if (is_dir($plugin_dir)) {
            $this->remove_dir($plugin_dir);
        }

        // Restore from backup
        $this->copy_dir($backup_path, $plugin_dir);

        // Reactivate if it was active
        if ($was_active && $plugin_file) {
            activate_plugin($plugin_file);
        }

        // Extend backup retention to 7 days (for investigation)
        wp_clear_scheduled_hook('epos_agent_cleanup_backup', [$plugin_slug]);
        wp_schedule_single_event(time() + (7 * 86400), 'epos_agent_cleanup_backup', [$plugin_slug]);

        error_log('[EPOS Agent] Successfully rolled back ' . $plugin_slug);
        return true;
    }

    /**
     * Rollback by downloading a specific version from Portal
     * Used for Portal-initiated manual rollback
     */
    public function rollback_from_portal($plugin_slug, $download_url, $file_hash = null) {
        // Download the ZIP
        $tmp_file = download_url($download_url, 300);
        if (is_wp_error($tmp_file)) {
            error_log('[EPOS Agent] Rollback download failed: ' . $tmp_file->get_error_message());
            return false;
        }

        // Verify hash if provided
        if ($file_hash && hash_file('sha256', $tmp_file) !== $file_hash) {
            @unlink($tmp_file);
            error_log('[EPOS Agent] Rollback file hash mismatch');
            return false;
        }

        // Use WordPress upgrader to install
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        
        // Check if plugin was active
        $plugin_file = $this->find_plugin_file($plugin_slug);
        $was_active = $plugin_file ? is_plugin_active($plugin_file) : false;

        // Install with overwrite
        $result = $upgrader->install($tmp_file, ['overwrite_package' => true]);
        @unlink($tmp_file);

        if (is_wp_error($result) || !$result) {
            error_log('[EPOS Agent] Rollback installation failed');
            return false;
        }

        // Reactivate if needed
        if ($was_active && $plugin_file) {
            activate_plugin($plugin_file);
        }

        return true;
    }

    /**
     * Cleanup backup for a plugin (called by WP Cron)
     */
    public static function cleanup_backup($plugin_slug) {
        $backup_path = get_option('epos_rollback_' . $plugin_slug);
        
        if ($backup_path && is_dir($backup_path)) {
            $instance = new self();
            $instance->remove_dir($backup_path);
        }

        delete_option('epos_rollback_' . $plugin_slug);
        delete_option('epos_rollback_version_' . $plugin_slug);
    }

    /**
     * Get the backed up version string for a plugin
     */
    public function get_backup_version($plugin_slug) {
        return get_option('epos_rollback_version_' . $plugin_slug, null);
    }

    /**
     * Find the main plugin file for a given slug
     */
    private function find_plugin_file($plugin_slug) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        
        $plugins = get_plugins();
        foreach ($plugins as $file => $data) {
            if (strpos($file, $plugin_slug . '/') === 0) {
                return $file;
            }
        }
        return null;
    }

    /**
     * Recursively copy a directory
     */
    private function copy_dir($src, $dst) {
        $dir = opendir($src);
        wp_mkdir_p($dst);
        
        while (($file = readdir($dir)) !== false) {
            if ($file === '.' || $file === '..') continue;
            
            $src_path = $src . '/' . $file;
            $dst_path = $dst . '/' . $file;
            
            if (is_dir($src_path)) {
                $this->copy_dir($src_path, $dst_path);
            } else {
                copy($src_path, $dst_path);
            }
        }
        closedir($dir);
    }

    /**
     * Recursively remove a directory
     */
    private function remove_dir($dir) {
        if (!is_dir($dir)) return;
        
        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        
        foreach ($items as $item) {
            if ($item->isDir()) {
                rmdir($item->getRealPath());
            } else {
                unlink($item->getRealPath());
            }
        }
        rmdir($dir);
    }
}

// Register cleanup cron action
add_action('epos_agent_cleanup_backup', ['Epos_Agent_Rollback', 'cleanup_backup']);
