<?php
/**
 * Admin settings page for EPOS WP Agent
 */

// Register the settings page
add_action('admin_menu', 'epos_agent_admin_menu');
add_action('admin_init', 'epos_agent_register_settings');

function epos_agent_admin_menu() {
    add_options_page(
        'EPOS Agent Settings',
        'EPOS Agent',
        'manage_options',
        'epos-agent-settings',
        'epos_agent_settings_page'
    );
}

function epos_agent_register_settings() {
    register_setting('epos_agent_settings', 'epos_agent_portal_url', [
        'sanitize_callback' => 'esc_url_raw',
    ]);
    register_setting('epos_agent_settings', 'epos_agent_api_key', [
        'sanitize_callback' => 'sanitize_text_field',
    ]);
}

function epos_agent_settings_page() {
    // Handle connection test
    if (isset($_POST['epos_agent_test_connection']) && check_admin_referer('epos_agent_settings-options')) {
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');
        
        if (!empty($portal_url) && !empty($api_key)) {
            $result = Epos_Agent_Activator::perform_handshake($portal_url, $api_key);
            if ($result) {
                $notice = '<div class="notice notice-success"><p>Successfully connected to the Portal!</p></div>';
            } else {
                $notice = '<div class="notice notice-error"><p>Failed to connect to the Portal. Please check your settings.</p></div>';
            }
        } else {
            $notice = '<div class="notice notice-warning"><p>Please enter both Portal URL and API Key first.</p></div>';
        }
    }

    $portal_url = get_option('epos_agent_portal_url', '');
    $api_key = get_option('epos_agent_api_key', '');
    $status = get_option('epos_agent_connection_status', 'pending');

    $status_labels = [
        'pending'      => '<span style="color: #dba617;">&#x23F3; Pending</span>',
        'connected'    => '<span style="color: #46b450;">&#x2705; Connected</span>',
        'disconnected' => '<span style="color: #dc3232;">&#x274C; Disconnected</span>',
        'error'        => '<span style="color: #dc3232;">&#x26A0;&#xFE0F; Error</span>',
    ];
    ?>
    <div class="wrap">
        <h1>EPOS Agent Settings</h1>
        
        <?php echo isset($notice) ? $notice : ''; ?>

        <div class="card" style="max-width: 600px; padding: 20px;">
            <h2>Connection Status: <?php echo $status_labels[$status] ?? $status; ?></h2>
        </div>

        <form method="post" action="options.php">
            <?php settings_fields('epos_agent_settings'); ?>
            
            <table class="form-table">
                <tr>
                    <th scope="row">
                        <label for="epos_agent_portal_url">Portal URL</label>
                    </th>
                    <td>
                        <input type="url" id="epos_agent_portal_url" name="epos_agent_portal_url" 
                               value="<?php echo esc_attr($portal_url); ?>" class="regular-text"
                               placeholder="https://portal.yourdomain.com">
                        <p class="description">The URL of your EPOS Portal instance.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="epos_agent_api_key">API Secret Key</label>
                    </th>
                    <td>
                        <input type="text" id="epos_agent_api_key" name="epos_agent_api_key" 
                               value="<?php echo esc_attr($api_key); ?>" class="regular-text"
                               placeholder="Enter the API key from your Portal">
                        <p class="description">The secret key generated when you registered this site in the Portal.</p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Save Settings'); ?>
        </form>

        <form method="post">
            <?php wp_nonce_field('epos_agent_settings-options'); ?>
            <input type="submit" name="epos_agent_test_connection" class="button button-secondary" 
                   value="Test Connection">
        </form>

        <hr>
        <h3>Plugin Information</h3>
        <table class="widefat" style="max-width: 400px;">
            <tr><td><strong>Plugin Version</strong></td><td><?php echo EPOS_AGENT_VERSION; ?></td></tr>
            <tr><td><strong>WordPress Version</strong></td><td><?php echo get_bloginfo('version'); ?></td></tr>
            <tr><td><strong>PHP Version</strong></td><td><?php echo phpversion(); ?></td></tr>
            <tr><td><strong>WooCommerce</strong></td><td><?php echo class_exists('WooCommerce') ? 'Active' : 'Not Active'; ?></td></tr>
        </table>
    </div>
    <?php
}

// Also hook SMTP configuration into phpmailer for all outgoing emails
add_action('phpmailer_init', ['Epos_Agent_Smtp_Config', 'configure_phpmailer']);
