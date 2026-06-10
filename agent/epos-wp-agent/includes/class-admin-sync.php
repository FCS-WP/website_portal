<?php
/**
 * Admin Account Sync for EPOS Agent
 * Monitors WordPress admin accounts and syncs to Portal credential vault
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Admin_Sync {

    /**
     * Initialize the admin sync system
     */
    public static function init() {
        $instance = new self();
        $instance->register_hooks();
        $instance->register_rest_routes();
    }

    /**
     * Register WordPress hooks for monitoring admin changes
     */
    public function register_hooks() {
        // Only register if sync is enabled
        if (!get_option('epos_agent_admin_sync_enabled', true)) {
            return;
        }

        // New user registered
        add_action('user_register', [$this, 'on_user_register'], 10, 2);

        // User role changed (promoted/demoted)
        add_action('set_user_role', [$this, 'on_set_user_role'], 10, 3);

        // Password changed programmatically
        add_action('wp_set_password', [$this, 'on_password_set'], 10, 2);

        // Password reset via forgot-password flow
        add_action('after_password_reset', [$this, 'on_password_reset'], 10, 2);

        // Profile updated (email, display name changes)
        add_action('profile_update', [$this, 'on_profile_update'], 10, 3);
    }

    /**
     * Register REST API endpoints
     */
    public function register_rest_routes() {
        add_action('rest_api_init', function () {
            // Portal can request admin list on demand
            register_rest_route('epos-agent/v1', '/admin-accounts', [
                'methods' => 'GET',
                'callback' => [$this, 'rest_get_admin_accounts'],
                'permission_callback' => [$this, 'verify_agent_key'],
            ]);
        });
    }

    /**
     * Verify the agent API key from request header
     */
    public function verify_agent_key($request) {
        $key = $request->get_header('X-Agent-Key');
        $stored_key = get_option('epos_agent_api_key', '');
        return !empty($key) && !empty($stored_key) && hash_equals($stored_key, $key);
    }

    /**
     * REST endpoint: GET /wp-json/epos-agent/v1/admin-accounts
     * Returns list of all administrators (without passwords)
     */
    public function rest_get_admin_accounts($request) {
        $admins = $this->get_admin_users();

        // Strip passwords for this endpoint (read-only)
        $safe_admins = array_map(function ($admin) {
            unset($admin['password']);
            return $admin;
        }, $admins);

        return new WP_REST_Response([
            'success' => true,
            'data' => [
                'admin_users' => $safe_admins,
                'total' => count($safe_admins),
            ],
        ], 200);
    }

    /**
     * Hook: New user registered
     */
    public function on_user_register($user_id, $userdata = null) {
        $user = get_userdata($user_id);
        if (!$user || !in_array('administrator', $user->roles)) {
            return;
        }

        // Try to capture password from POST data
        $password = null;
        if (isset($_POST['pass1']) && !empty($_POST['pass1'])) {
            $password = $_POST['pass1'];
        }

        $this->sync_single_admin($user, 'user_register', $password);
    }

    /**
     * Hook: User role changed
     */
    public function on_set_user_role($user_id, $role, $old_roles) {
        $user = get_userdata($user_id);
        if (!$user) return;

        if ($role === 'administrator') {
            // User promoted to admin — sync (no password available)
            $this->sync_single_admin($user, 'role_change', null);
        }
        // If demoted from admin, we don't delete credentials — just stop syncing
    }

    /**
     * Hook: Password set programmatically
     * This fires BEFORE the password is hashed
     */
    public function on_password_set($password, $user_id) {
        $user = get_userdata($user_id);
        if (!$user || !in_array('administrator', $user->roles)) {
            return;
        }

        $this->sync_single_admin($user, 'password_change', $password);
    }

    /**
     * Hook: Password reset via forgot-password flow
     */
    public function on_password_reset($user, $new_pass) {
        if (!$user || !in_array('administrator', $user->roles)) {
            return;
        }

        $this->sync_single_admin($user, 'password_change', $new_pass);
    }

    /**
     * Hook: Profile updated
     */
    public function on_profile_update($user_id, $old_user_data, $userdata = null) {
        $user = get_userdata($user_id);
        if (!$user || !in_array('administrator', $user->roles)) {
            return;
        }

        // Check if relevant fields changed
        $changed = false;
        if ($old_user_data->user_email !== $user->user_email) $changed = true;
        if ($old_user_data->display_name !== $user->display_name) $changed = true;
        if ($old_user_data->user_login !== $user->user_login) $changed = true;

        if ($changed) {
            $this->sync_single_admin($user, 'profile_update', null);
        }
    }

    /**
     * Get all administrator users
     */
    public function get_admin_users() {
        $admins = get_users(['role' => 'administrator']);
        $login_url = self::get_login_url();
        $result = [];

        foreach ($admins as $admin) {
            $result[] = [
                'wp_user_id' => $admin->ID,
                'username' => $admin->user_login,
                'email' => $admin->user_email,
                'display_name' => $admin->display_name,
                'role' => 'administrator',
                'password' => null, // Can't read existing hashed passwords
                'login_url' => $login_url,
            ];
        }

        return $result;
    }

    /**
     * Sync a single admin user to Portal
     */
    private function sync_single_admin($user, $reason, $password = null) {
        $credentials = [[
            'wp_user_id' => $user->ID,
            'username' => $user->user_login,
            'email' => $user->user_email,
            'display_name' => $user->display_name,
            'role' => 'administrator',
            'password' => $password,
            'login_url' => self::get_login_url(),
        ]];

        $this->sync_to_portal($credentials, $reason);
    }

    /**
     * Resolve the admin login URL the Portal should display.
     *
     * When the /epos-login customizer is active, the plugin's site_url
     * filter has already rewritten wp_login_url() output, so the value we
     * return here naturally points at /epos-login. When disabled, we fall
     * back to whatever wp_login_url() returns (typically /wp-login.php),
     * which is still the correct URL for that site.
     */
    private static function get_login_url() {
        if (
            class_exists('Epos_Agent_Login_Customizer')
            && Epos_Agent_Login_Customizer::is_enabled()
        ) {
            return home_url('/' . Epos_Agent_Login_Customizer::LOGIN_SLUG);
        }

        return wp_login_url();
    }

    /**
     * Manual sync — push ALL admin accounts to Portal
     * Called by the "Sync Now" button on settings page
     */
    public static function manual_sync() {
        $instance = new self();
        $admins = $instance->get_admin_users();

        if (empty($admins)) {
            return ['success' => false, 'message' => 'No administrator accounts found'];
        }

        $result = $instance->sync_to_portal($admins, 'manual_push');

        if ($result) {
            update_option('epos_agent_last_admin_sync', current_time('mysql'));
            return ['success' => true, 'message' => "Synced " . count($admins) . " admin account(s)", 'count' => count($admins)];
        }

        return ['success' => false, 'message' => 'Failed to sync with Portal'];
    }

    /**
     * Send credentials to Portal
     */
    private function sync_to_portal($credentials, $reason) {
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key)) {
            return false;
        }

        $endpoint = rtrim($portal_url, '/') . '/api/agent/sync-credentials';

        $response = wp_remote_post($endpoint, [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'X-Agent-Key' => $api_key,
                'X-Site-Url' => get_site_url(),
            ],
            'body' => json_encode([
                'credentials' => $credentials,
                'sync_reason' => $reason,
            ]),
        ]);

        if (is_wp_error($response)) {
            error_log('[EPOS Agent] Admin sync failed: ' . $response->get_error_message());
            return false;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code === 200) {
            update_option('epos_agent_last_admin_sync', current_time('mysql'));
            return true;
        }

        $body = wp_remote_retrieve_body($response);
        error_log('[EPOS Agent] Admin sync failed (HTTP ' . $code . '): ' . $body);
        return false;
    }
}
