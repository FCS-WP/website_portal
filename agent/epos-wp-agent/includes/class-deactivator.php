<?php
/**
 * Fired during plugin deactivation.
 */
class Epos_Agent_Deactivator {

    /**
     * Deactivate the plugin.
     * - Clear scheduled cron events
     */
    public static function deactivate() {
        // Clear the ping cron
        $timestamp = wp_next_scheduled('epos_agent_ping_hook');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'epos_agent_ping_hook');
        }

        // Update connection status
        update_option('epos_agent_connection_status', 'disconnected');
    }
}
