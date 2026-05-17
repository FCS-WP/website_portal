<?php
/**
 * Two-Factor Authentication Manager for EPOS Agent
 * Manages WP 2FA plugin installation, configuration, and status
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Security_2fa_Manager {

    private static $preferred_plugin = 'wp-2fa/wp-2fa.php';
    private static $plugin_slug = 'wp-2fa';

    /**
     * Enable 2FA by installing and configuring WP 2FA plugin
     *
     * @param string $method  Authentication method (default: totp)
     * @param bool   $enforce Whether to enforce for admins
     * @return array
     */
    public static function enable_2fa($method = 'totp', $enforce = true) {
        // 1. Check if WP 2FA plugin is installed
        if (!self::is_plugin_installed()) {
            $result = self::install_2fa_plugin();
            if (is_wp_error($result)) {
                return ['success' => false, 'message' => $result->get_error_message()];
            }
        }

        // 2. Activate plugin if not active
        if (!is_plugin_active(self::$preferred_plugin)) {
            activate_plugin(self::$preferred_plugin);
        }

        // 3. Configure plugin settings
        self::configure_plugin($method, $enforce);

        return [
            'success'          => true,
            'plugin_installed' => self::$plugin_slug,
            'method'           => $method,
            'enforce'          => $enforce,
        ];
    }

    /**
     * Disable 2FA by deactivating the plugin
     *
     * @return array
     */
    public static function disable_2fa() {
        if (is_plugin_active(self::$preferred_plugin)) {
            deactivate_plugins(self::$preferred_plugin);
        }
        return ['success' => true];
    }

    /**
     * Get current 2FA status
     *
     * @return array
     */
    public static function get_2fa_status() {
        $enabled = is_plugin_active(self::$preferred_plugin);
        $admin_users = get_users(['role' => 'administrator']);
        $users_status = [];

        foreach ($admin_users as $user) {
            $has_2fa = get_user_meta($user->ID, 'wp_2fa_enabled_methods', true);
            $users_status[] = [
                'user_id'        => $user->ID,
                'username'       => $user->user_login,
                'two_fa_enabled' => !empty($has_2fa),
                'method'         => !empty($has_2fa) ? 'totp' : null,
            ];
        }

        return [
            'enabled'         => $enabled,
            'method'          => $enabled ? 'totp' : null,
            'enforce_enabled' => $enabled,
            'wp_plugin_used'  => self::$plugin_slug,
            'admin_users'     => $users_status,
        ];
    }

    /**
     * Check if the 2FA plugin is installed
     *
     * @return bool
     */
    private static function is_plugin_installed() {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugins = get_plugins();
        return isset($plugins[self::$preferred_plugin]);
    }

    /**
     * Install WP 2FA plugin from WordPress.org
     *
     * @return bool|WP_Error
     */
    private static function install_2fa_plugin() {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

        $api = plugins_api('plugin_information', ['slug' => self::$plugin_slug]);
        if (is_wp_error($api)) return $api;

        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        return $upgrader->install($api->download_link);
    }

    /**
     * Configure WP 2FA plugin options
     *
     * @param string $method
     * @param bool   $enforce
     */
    private static function configure_plugin($method, $enforce) {
        update_option('wp_2fa_policy', [
            'enforced_roles' => $enforce ? ['administrator'] : [],
            'methods'        => [$method],
        ]);
    }
}
