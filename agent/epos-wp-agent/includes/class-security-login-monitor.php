<?php
/**
 * Login Activity Monitor for EPOS Agent
 * Buffers login success/failure events for periodic reporting to Portal
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Security_Login_Monitor {

    private static $buffer_option = 'epos_agent_login_buffer';

    /**
     * Initialize login monitoring hooks
     */
    public static function init() {
        add_action('wp_login_failed', [__CLASS__, 'on_login_failed'], 10, 2);
        add_action('wp_login', [__CLASS__, 'on_login_success'], 10, 2);
    }

    /**
     * Handle failed login attempt
     *
     * @param string        $username
     * @param WP_Error|null $error
     */
    public static function on_login_failed($username, $error = null) {
        self::buffer_event([
            'type'       => 'failed',
            'username'   => sanitize_text_field($username),
            'ip'         => self::get_client_ip(),
            'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field($_SERVER['HTTP_USER_AGENT']) : '',
            'timestamp'  => time(),
        ]);
    }

    /**
     * Handle successful login
     *
     * @param string  $username
     * @param WP_User $user
     */
    public static function on_login_success($username, $user) {
        self::buffer_event([
            'type'       => 'success',
            'username'   => $username,
            'user_id'    => $user->ID,
            'ip'         => self::get_client_ip(),
            'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field($_SERVER['HTTP_USER_AGENT']) : '',
            'timestamp'  => time(),
        ]);
    }

    /**
     * Flush buffered events (called during ping)
     *
     * @return array
     */
    public static function flush_buffer() {
        $events = get_option(self::$buffer_option, []);
        if (empty($events)) return [];

        delete_option(self::$buffer_option);
        return $events;
    }

    /**
     * Get count of buffered events
     *
     * @return int
     */
    public static function get_buffered_count() {
        $events = get_option(self::$buffer_option, []);
        return count($events);
    }

    /**
     * Buffer a login event
     *
     * @param array $event
     */
    private static function buffer_event($event) {
        $buffer = get_option(self::$buffer_option, []);
        $buffer[] = $event;

        // Cap buffer at 500 events to prevent memory issues
        if (count($buffer) > 500) {
            $buffer = array_slice($buffer, -500);
        }

        update_option(self::$buffer_option, $buffer, false);
    }

    /**
     * Get the client IP address
     *
     * @return string
     */
    private static function get_client_ip() {
        $headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = trim(explode(',', $_SERVER[$header])[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}
