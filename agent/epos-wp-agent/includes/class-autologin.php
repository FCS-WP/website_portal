<?php
/**
 * EPOS Agent - Quick Login Handler
 * Handles auto-login via Portal-issued JWT tokens
 */

if (!defined('ABSPATH')) exit;

class EPOS_Agent_Autologin {

    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes() {
        register_rest_route('epos-agent/v1', '/autologin', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_autologin'],
            'permission_callback' => '__return_true', // Public endpoint, token handles auth
            'args' => [
                'token' => [
                    'required' => true,
                    'type' => 'string',
                ],
            ],
        ]);
    }

    public function handle_autologin($request) {
        $token = $request->get_param('token');

        if (empty($token)) {
            wp_die('Missing login token.', 'Login Failed', ['response' => 400]);
        }

        // Verify token with Portal
        $portal_url = get_option('epos_agent_portal_url');
        $agent_key = get_option('epos_agent_api_key');
        $site_url = get_option('siteurl');

        if (empty($portal_url) || empty($agent_key)) {
            wp_die('Agent not configured.', 'Login Failed', ['response' => 500]);
        }

        $response = wp_remote_post(rtrim($portal_url, '/') . '/api/agent/verify-login-token', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'X-Agent-Key' => $agent_key,
                'X-Site-Url' => $site_url,
            ],
            'body' => json_encode(['token' => $token]),
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            wp_die('Could not verify login token: ' . $response->get_error_message(), 'Login Failed', ['response' => 502]);
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (empty($body['valid']) || $body['valid'] !== true) {
            wp_die('Login link is invalid or expired.', 'Login Failed', ['response' => 401]);
        }

        // Get WP username from response
        $wp_username = !empty($body['wp_username']) ? $body['wp_username'] : 'admin';

        // Find the user
        $user = get_user_by('login', $wp_username);
        if (!$user) {
            // Try by email as fallback
            $user = get_user_by('email', $wp_username);
        }
        if (!$user) {
            // Last resort: get first admin user
            $admins = get_users(['role' => 'administrator', 'number' => 1]);
            $user = !empty($admins) ? $admins[0] : null;
        }

        if (!$user) {
            wp_die('Admin user not found on this site.', 'Login Failed', ['response' => 404]);
        }

        // Log in the user
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, false);
        do_action('wp_login', $user->user_login, $user);

        // Redirect to WP Admin
        wp_redirect(admin_url());
        exit;
    }
}
