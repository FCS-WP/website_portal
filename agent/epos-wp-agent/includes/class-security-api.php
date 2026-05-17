<?php
/**
 * Security REST API Endpoints for EPOS Agent
 * Registers and handles all security-related REST routes
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Security_Api {

    /**
     * Initialize REST API routes
     */
    public static function init() {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    /**
     * Register all security REST routes
     */
    public static function register_routes() {
        $namespace = 'epos-agent/v1';

        // File integrity
        register_rest_route($namespace, '/security/file-scan', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_file_scan'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        register_rest_route($namespace, '/security/baseline/create', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_baseline_create'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        register_rest_route($namespace, '/security/file-content', [
            'methods'             => 'GET',
            'callback'            => [__CLASS__, 'handle_file_content'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        // 2FA
        register_rest_route($namespace, '/security/2fa/enable', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_2fa_enable'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        register_rest_route($namespace, '/security/2fa/disable', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_2fa_disable'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        register_rest_route($namespace, '/security/2fa/status', [
            'methods'             => 'GET',
            'callback'            => [__CLASS__, 'handle_2fa_status'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        // User management
        register_rest_route($namespace, '/security/users/delete', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_user_delete'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);

        register_rest_route($namespace, '/security/users/admins', [
            'methods'             => 'GET',
            'callback'            => [__CLASS__, 'handle_admin_users'],
            'permission_callback' => [__CLASS__, 'verify_agent_key'],
        ]);
    }

    /**
     * Permission callback — verify agent API key
     *
     * @param WP_REST_Request $request
     * @return bool
     */
    public static function verify_agent_key($request) {
        $key = $request->get_header('X-Agent-Key');
        $stored_key = get_option('epos_agent_api_key', '');
        return !empty($key) && !empty($stored_key) && hash_equals($stored_key, $key);
    }

    /**
     * Handle file integrity scan request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_file_scan($request) {
        $result = Epos_Agent_Security_File_Monitor::run_scan();
        return new WP_REST_Response($result, 200);
    }

    /**
     * Handle baseline creation request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_baseline_create($request) {
        $result = Epos_Agent_Security_File_Monitor::create_baseline();
        return new WP_REST_Response($result, 200);
    }

    /**
     * Handle file content retrieval request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_file_content($request) {
        $path = $request->get_param('path');
        if (empty($path)) {
            return new WP_REST_Response(['error' => 'Path parameter required'], 400);
        }
        $result = Epos_Agent_Security_File_Monitor::get_file_content($path);
        if (is_wp_error($result)) {
            return new WP_REST_Response(['error' => $result->get_error_message()], 400);
        }
        return new WP_REST_Response($result, 200);
    }

    /**
     * Handle 2FA enable request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_2fa_enable($request) {
        $method = $request->get_param('method') ?: 'totp';
        $enforce = $request->get_param('enforce') !== false;
        $result = Epos_Agent_Security_2fa_Manager::enable_2fa($method, $enforce);
        return new WP_REST_Response($result, $result['success'] ? 200 : 500);
    }

    /**
     * Handle 2FA disable request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_2fa_disable($request) {
        $result = Epos_Agent_Security_2fa_Manager::disable_2fa();
        return new WP_REST_Response($result, 200);
    }

    /**
     * Handle 2FA status request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_2fa_status($request) {
        $result = Epos_Agent_Security_2fa_Manager::get_2fa_status();
        return new WP_REST_Response($result, 200);
    }

    /**
     * Handle user deletion request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_user_delete($request) {
        $wp_user_id = $request->get_param('wp_user_id');
        if (empty($wp_user_id)) {
            return new WP_REST_Response(['error' => 'wp_user_id required'], 400);
        }

        // Safety: can't delete user ID 1 or sole admin
        if ($wp_user_id == 1) {
            return new WP_REST_Response(['error' => 'Cannot delete primary admin'], 403);
        }

        $admins = get_users(['role' => 'administrator']);
        if (count($admins) <= 1) {
            return new WP_REST_Response(['error' => 'Cannot delete only remaining admin'], 403);
        }

        require_once ABSPATH . 'wp-admin/includes/user.php';
        $result = wp_delete_user($wp_user_id, 1); // Reassign content to user 1

        return new WP_REST_Response([
            'success' => $result !== false,
            'message' => $result ? 'User deleted' : 'Failed to delete user',
        ], $result ? 200 : 500);
    }

    /**
     * Handle admin users list request
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public static function handle_admin_users($request) {
        $result = Epos_Agent_Security_User_Monitor::get_admin_users();
        return new WP_REST_Response($result, 200);
    }
}
