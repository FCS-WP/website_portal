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
    register_setting('epos_agent_settings', 'epos_agent_admin_sync_enabled', [
        'sanitize_callback' => 'epos_agent_sanitize_checkbox',
        'default' => true,
    ]);
}

function epos_agent_sanitize_checkbox($value) {
    return (bool) $value;
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

        <form method="post" action="options.php" id="epos-agent-settings-form">
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

        <hr>
        <h3>Admin Account Sync</h3>

        <?php
        $sync_enabled = get_option('epos_agent_admin_sync_enabled', true);
        $last_sync = get_option('epos_agent_last_admin_sync', '');
        $admin_users = get_users(['role' => 'administrator']);
        ?>

        <table class="form-table">
            <tr>
                <th scope="row">Automatic Sync</th>
                <td>
                    <label>
                        <input type="checkbox" name="epos_agent_admin_sync_enabled" value="1"
                               <?php checked($sync_enabled); ?>
                               form="epos-agent-settings-form">
                        Automatically sync administrator accounts to Portal
                    </label>
                </td>
            </tr>
        </table>

        <h4>Current Administrators</h4>
        <table class="widefat striped" style="max-width: 600px;">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($admin_users as $admin) : ?>
                <tr>
                    <td><?php echo esc_html($admin->user_login); ?></td>
                    <td><?php echo esc_html($admin->user_email); ?></td>
                    <td><span class="dashicons dashicons-shield" style="color: #d63638;"></span> Administrator</td>
                    <td><span style="color: #46b450;">&#x2705; Active</span></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <p style="margin-top: 15px;">
            <button type="button" id="epos-agent-sync-now" class="button button-primary">
                Sync Now
            </button>
            <span id="epos-agent-sync-status" style="margin-left: 10px;"></span>
        </p>

        <p class="description">
            <?php if ($last_sync) : ?>
                Last synced: <strong><?php echo esc_html($last_sync); ?></strong>
            <?php else : ?>
                Never synced
            <?php endif; ?>
        </p>

        <script type="text/javascript">
        (function($) {
            $('#epos-agent-sync-now').on('click', function() {
                var $btn = $(this);
                var $status = $('#epos-agent-sync-status');

                $btn.prop('disabled', true).text('Syncing...');
                $status.html('');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'epos_agent_manual_sync',
                        nonce: '<?php echo wp_create_nonce('epos_agent_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            $status.html('<span style="color: #46b450;">&#x2705; ' + response.data.message + '</span>');
                        } else {
                            $status.html('<span style="color: #dc3232;">&#x274C; ' + (response.data.message || 'Sync failed') + '</span>');
                        }
                    },
                    error: function() {
                        $status.html('<span style="color: #dc3232;">&#x274C; Request failed</span>');
                    },
                    complete: function() {
                        $btn.prop('disabled', false).text('Sync Now');
                    }
                });
            });
        })(jQuery);
        </script>
    </div>
    <?php
}

// AJAX handler for manual admin sync
add_action('wp_ajax_epos_agent_manual_sync', 'epos_agent_handle_manual_sync');

function epos_agent_handle_manual_sync() {
    check_ajax_referer('epos_agent_nonce', 'nonce');

    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }

    require_once plugin_dir_path(dirname(__FILE__)) . 'includes/class-admin-sync.php';
    $result = Epos_Agent_Admin_Sync::manual_sync();

    if ($result['success']) {
        wp_send_json_success($result);
    } else {
        wp_send_json_error($result);
    }
}

// Also hook SMTP configuration into phpmailer for all outgoing emails
add_action('phpmailer_init', ['Epos_Agent_Smtp_Config', 'configure_phpmailer']);
