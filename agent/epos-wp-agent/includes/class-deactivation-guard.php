<?php
/**
 * Prevents deactivation while this site is actively connected to the Portal.
 * Why: deactivating the plugin in production silently severs Portal monitoring
 * and orphans the site record. We require an explicit disconnect first.
 *
 * The lock engages only when epos_agent_connection_status === 'connected'.
 * Pending / disconnected / error states leave the plugin freely deactivatable.
 */
class Epos_Agent_Deactivation_Guard {

    public static function init() {
        add_filter('plugin_action_links_' . EPOS_AGENT_PLUGIN_BASENAME, [self::class, 'filter_action_links']);
        add_action('admin_init', [self::class, 'block_deactivation_request']);
        add_action('admin_notices', [self::class, 'render_blocked_notice']);
    }

    /**
     * True when the plugin should be locked from deactivation.
     */
    public static function is_locked() {
        return get_option('epos_agent_connection_status', 'pending') === 'connected';
    }

    /**
     * Replace the Deactivate link on the plugins list page with a disabled label.
     */
    public static function filter_action_links($links) {
        if (!self::is_locked()) {
            return $links;
        }
        if (isset($links['deactivate'])) {
            $links['deactivate'] = '<span style="color:#646970;" title="Disconnect from the Portal first.">Deactivate disabled</span>';
        }
        return $links;
    }

    /**
     * Block the deactivation request itself. WordPress fires this whether the
     * user clicked the row link or chose Bulk Actions → Deactivate, so this is
     * the chokepoint that actually enforces the policy.
     */
    public static function block_deactivation_request() {
        if (!self::is_locked()) {
            return;
        }
        if (empty($_GET['action']) && empty($_POST['action']) && empty($_POST['action2'])) {
            return;
        }

        $action  = $_GET['action']    ?? ($_POST['action']  ?? '');
        $action2 = $_POST['action2']  ?? '';
        $is_deactivate_action = in_array('deactivate', [$action, $action2], true)
                             || in_array('deactivate-selected', [$action, $action2], true);

        if (!$is_deactivate_action) {
            return;
        }

        // Single-plugin deactivation: ?plugin=...
        if (!empty($_GET['plugin']) && $_GET['plugin'] === EPOS_AGENT_PLUGIN_BASENAME) {
            self::redirect_blocked();
        }
        // Bulk deactivation: checked[] = [...]
        if (!empty($_POST['checked']) && is_array($_POST['checked'])
            && in_array(EPOS_AGENT_PLUGIN_BASENAME, $_POST['checked'], true)) {
            self::redirect_blocked();
        }
    }

    private static function redirect_blocked() {
        $url = add_query_arg([
            'epos_agent_blocked' => '1',
            's' => isset($_REQUEST['s']) ? $_REQUEST['s'] : false,
        ], admin_url('plugins.php'));
        wp_safe_redirect($url);
        exit;
    }

    /**
     * Show a notice after a blocked attempt, and a passive notice on the
     * plugins page so the lock state is obvious before the user tries.
     */
    public static function render_blocked_notice() {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || $screen->id !== 'plugins') {
            return;
        }

        if (!empty($_GET['epos_agent_blocked'])) {
            echo '<div class="notice notice-error"><p><strong>EPOS Agent:</strong> Deactivation is blocked while this site is connected to the Portal. Disconnect from the Portal first (clear credentials in <em>Settings → EPOS Agent</em>), then deactivate.</p></div>';
            return;
        }

        if (self::is_locked()) {
            echo '<div class="notice notice-info"><p><strong>EPOS Agent</strong> is locked against deactivation because this site is connected to the Portal. <a href="' . esc_url(admin_url('options-general.php?page=epos-agent-settings')) . '">Manage connection</a>.</p></div>';
        }
    }
}
