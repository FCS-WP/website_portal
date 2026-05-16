<?php
/**
 * Registers WP REST API endpoints for the Agent.
 * These endpoints are called BY the Portal to issue commands.
 */
class Epos_Agent_Api {

    public static function init() {
        add_action('rest_api_init', [self::class, 'register_routes']);
    }

    /**
     * Register REST API routes under namespace: epos-agent/v1
     */
    public static function register_routes() {
        $namespace = 'epos-agent/v1';

        // Plugin install/update endpoint
        register_rest_route($namespace, '/plugin/install', [
            'methods'             => 'POST',
            'callback'            => [self::class, 'handle_plugin_install'],
            'permission_callback' => [self::class, 'verify_agent_key'],
        ]);

        // SMTP update endpoint
        register_rest_route($namespace, '/smtp/update', [
            'methods'             => 'POST',
            'callback'            => [self::class, 'handle_smtp_update'],
            'permission_callback' => [self::class, 'verify_agent_key'],
        ]);

        // SMTP test endpoint
        register_rest_route($namespace, '/smtp/test', [
            'methods'             => 'POST',
            'callback'            => [self::class, 'handle_smtp_test'],
            'permission_callback' => [self::class, 'verify_agent_key'],
        ]);

        // Status endpoint
        register_rest_route($namespace, '/status', [
            'methods'             => 'GET',
            'callback'            => [self::class, 'handle_status'],
            'permission_callback' => [self::class, 'verify_agent_key'],
        ]);

        // Rollback endpoint (Portal-initiated manual rollback)
        register_rest_route($namespace, '/rollback', [
            'methods'             => 'POST',
            'callback'            => [self::class, 'handle_rollback'],
            'permission_callback' => [self::class, 'verify_agent_key'],
        ]);
    }

    /**
     * Verify the X-Agent-Key header matches the stored API key
     */
    public static function verify_agent_key($request) {
        $provided_key = $request->get_header('X-Agent-Key');
        $stored_key = get_option('epos_agent_api_key', '');

        if (empty($stored_key) || empty($provided_key)) {
            return new \WP_Error(
                'unauthorized',
                'Invalid or missing API key.',
                ['status' => 401]
            );
        }

        if (!hash_equals($stored_key, $provided_key)) {
            return new \WP_Error(
                'unauthorized',
                'Invalid API key.',
                ['status' => 401]
            );
        }

        return true;
    }

    /**
     * Handle plugin install/update command from Portal
     */
    public static function handle_plugin_install($request) {
        $installer = new Epos_Agent_Plugin_Installer();
        return $installer->install($request);
    }

    /**
     * Handle SMTP configuration update from Portal
     */
    public static function handle_smtp_update($request) {
        $smtp = new Epos_Agent_Smtp_Config();
        return $smtp->update($request);
    }

    /**
     * Handle SMTP test email request
     */
    public static function handle_smtp_test($request) {
        $smtp = new Epos_Agent_Smtp_Config();
        return $smtp->test($request);
    }

    /**
     * Return site status information
     */
    public static function handle_status($request) {
        return rest_ensure_response([
            'success'        => true,
            'wp_version'     => get_bloginfo('version'),
            'php_version'    => phpversion(),
            'woo_active'     => class_exists('WooCommerce'),
            'active_plugins' => Epos_Agent_Activator::get_epos_plugins(),
        ]);
    }

    /**
     * Handle Portal-initiated manual rollback
     */
    public static function handle_rollback($request) {
        $plugin_slug  = $request->get_param('plugin_slug');
        $download_url = $request->get_param('download_url');
        $version      = $request->get_param('version');
        $file_hash    = $request->get_param('file_hash');

        if (empty($plugin_slug) || empty($download_url)) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'Missing required parameters: plugin_slug, download_url',
            ], 400);
        }

        $rollback = new Epos_Agent_Rollback();

        // First try local backup
        $backup_path = get_option('epos_rollback_' . $plugin_slug);
        if ($backup_path && is_dir($backup_path)) {
            $success = $rollback->rollback($plugin_slug);
        } else {
            // Download from Portal
            $success = $rollback->rollback_from_portal($plugin_slug, $download_url, $file_hash);
        }

        if ($success) {
            return new \WP_REST_Response([
                'success' => true,
                'message' => "Rolled back {$plugin_slug} to v{$version}",
                'data'    => [
                    'plugin_slug'    => $plugin_slug,
                    'rolled_back_to' => $version,
                ],
            ], 200);
        }

        return new \WP_REST_Response([
            'success' => false,
            'message' => "Failed to rollback {$plugin_slug}",
        ], 500);
    }
}
