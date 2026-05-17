<?php
/**
 * User Security Monitor for EPOS Agent
 * Monitors admin user creation and role changes, sends immediate alerts
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Security_User_Monitor {

    /**
     * Initialize user monitoring hooks
     */
    public static function init() {
        add_action('user_register', [__CLASS__, 'on_user_register'], 10, 1);
        add_action('set_user_role', [__CLASS__, 'on_role_change'], 10, 3);
    }

    /**
     * Handle new user registration
     *
     * @param int $user_id
     */
    public static function on_user_register($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return;

        $roles = (array) $user->roles;

        if (in_array('administrator', $roles)) {
            self::send_immediate_alert('new_admin_created', [
                'user_id'    => $user_id,
                'username'   => $user->user_login,
                'email'      => $user->user_email,
                'ip'         => $_SERVER['REMOTE_ADDR'] ?? '',
                'created_at' => time(),
            ]);
        }
    }

    /**
     * Handle user role change
     *
     * @param int    $user_id
     * @param string $new_role
     * @param array  $old_roles
     */
    public static function on_role_change($user_id, $new_role, $old_roles) {
        if ($new_role === 'administrator' && !in_array('administrator', (array) $old_roles)) {
            $user = get_userdata($user_id);
            if (!$user) return;

            self::send_immediate_alert('user_promoted_to_admin', [
                'user_id'     => $user_id,
                'username'    => $user->user_login,
                'email'       => $user->user_email,
                'old_roles'   => (array) $old_roles,
                'ip'          => $_SERVER['REMOTE_ADDR'] ?? '',
                'promoted_at' => time(),
            ]);
        }
    }

    /**
     * Get list of all admin users for weekly sync
     *
     * @return array
     */
    public static function get_admin_users() {
        $admins = get_users(['role' => 'administrator']);
        $result = [];

        foreach ($admins as $admin) {
            $result[] = [
                'user_id'       => $admin->ID,
                'username'      => $admin->user_login,
                'email'         => $admin->user_email,
                'registered_at' => strtotime($admin->user_registered),
                'last_login_at' => get_user_meta($admin->ID, 'last_login', true) ?: null,
            ];
        }

        return $result;
    }

    /**
     * Send immediate alert to Portal
     *
     * @param string $event_type
     * @param array  $data
     */
    private static function send_immediate_alert($event_type, $data) {
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key)) return;

        wp_remote_post($portal_url . '/api/agent/security/user-alert', [
            'timeout' => 5,
            'headers' => [
                'X-Agent-Key'  => $api_key,
                'X-Site-Url'   => get_site_url(),
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'event_type' => $event_type,
                'data'       => $data,
            ]),
        ]);
    }
}
