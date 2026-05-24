<?php
class Epos_Agent_Deactivator {

    public static function deactivate() {
        $timestamp = wp_next_scheduled('epos_agent_ping_hook');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'epos_agent_ping_hook');
        }

        update_option('epos_agent_connection_status', 'disconnected');

        // Restores access to wp-login.php so admins can't get locked out
        // while the plugin is off.
        flush_rewrite_rules();
    }
}
