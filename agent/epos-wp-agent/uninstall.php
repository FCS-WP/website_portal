<?php
/**
 * Fired when the plugin is uninstalled.
 * Cleans up all plugin data from the database.
 */

// If uninstall not called from WordPress, die
if (!defined('WP_UNINSTALL_PLUGIN')) {
    die;
}

// Remove all plugin options
delete_option('epos_agent_portal_url');
delete_option('epos_agent_api_key');
delete_option('epos_agent_connection_status');
delete_option('epos_agent_last_order_sync');
delete_option('epos_smtp_host');
delete_option('epos_smtp_port');
delete_option('epos_smtp_username');
delete_option('epos_smtp_password');
delete_option('epos_smtp_encryption');
delete_option('epos_smtp_from_email');
delete_option('epos_smtp_from_name');
delete_option('epos_smtp_enabled');

// Clear any scheduled cron events
$timestamp = wp_next_scheduled('epos_agent_ping_hook');
if ($timestamp) {
    wp_unschedule_event($timestamp, 'epos_agent_ping_hook');
}
