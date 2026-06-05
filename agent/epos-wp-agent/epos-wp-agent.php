<?php
/**
 * Plugin Name: EPOS WP Agent
 * Plugin URI: https://portal.epos.com
 * Description: Communication bridge between this WordPress site and the EPOS Central Control Portal.
 * Version: 1.2.4
 * Author: EPOS Team
 * Author URI: https://epos.com
 * License: GPL-2.0+
 * Text Domain: epos-wp-agent
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Abort if accessed directly
if (!defined('WPINC')) {
    die;
}

define('EPOS_AGENT_VERSION', '1.2.4');
define('EPOS_AGENT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('EPOS_AGENT_PLUGIN_URL', plugin_dir_url(__FILE__));
define('EPOS_AGENT_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Include core classes
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-activator.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-deactivator.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-api.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-ping.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-plugin-installer.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-plugin-updater.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-order-sync.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-smtp-config.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-autologin.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-health-check.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-rollback.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-security-file-monitor.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-security-login-monitor.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-security-user-monitor.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-security-2fa-manager.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-security-api.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-external-plugin-manager.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-deactivation-guard.php';
require_once EPOS_AGENT_PLUGIN_DIR . 'includes/class-login-customizer.php';

// Activation / Deactivation hooks
register_activation_hook(__FILE__, ['Epos_Agent_Activator', 'activate']);
register_deactivation_hook(__FILE__, ['Epos_Agent_Deactivator', 'deactivate']);

/**
 * Initialize the plugin
 */
function epos_agent_init() {
    // Register REST API endpoints
    Epos_Agent_Api::init();
    
    // Register cron ping
    Epos_Agent_Ping::init();
    
    // Register plugin updater for EPOS plugins
    Epos_Agent_Plugin_Updater::init();

    // Register autologin handler
    new EPOS_Agent_Autologin();

    // Initialize admin account sync
    require_once plugin_dir_path(__FILE__) . 'includes/class-admin-sync.php';
    Epos_Agent_Admin_Sync::init();

    // Initialize health check cron handler
    Epos_Agent_Health_Check::init();

    // Initialize security modules
    Epos_Agent_Security_Api::init();
    Epos_Agent_Security_Login_Monitor::init();
    Epos_Agent_Security_User_Monitor::init();

    // Initialize external plugin manager
    Epos_Agent_External_Plugin_Manager::init();

    // Hidden login URL + branded login UI (gated by wp_option
    // epos_login_customizer_enabled — defaults to true).
    Epos_Agent_Login_Customizer::init();
}
add_action('init', 'epos_agent_init');

/**
 * Load admin settings page
 */
if (is_admin()) {
    require_once EPOS_AGENT_PLUGIN_DIR . 'admin/settings-page.php';
    Epos_Agent_Deactivation_Guard::init();
}
