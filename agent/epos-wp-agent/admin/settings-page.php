<?php
/**
 * Admin settings page for EPOS WP Agent
 */

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

/**
 * Format a unix timestamp / iso string as a relative time (e.g. "3 minutes ago").
 * Empty/zero input returns "Never".
 */
function epos_agent_format_relative($input) {
    if (empty($input)) {
        return 'Never';
    }
    $ts = is_numeric($input) ? (int) $input : strtotime($input);
    if (!$ts) {
        return 'Never';
    }
    return human_time_diff($ts, current_time('timestamp')) . ' ago';
}

function epos_agent_settings_page() {
    $portal_url     = get_option('epos_agent_portal_url', '');
    $api_key        = get_option('epos_agent_api_key', '');
    $status         = get_option('epos_agent_connection_status', 'pending');
    $sync_enabled   = get_option('epos_agent_admin_sync_enabled', true);
    $last_sync      = get_option('epos_agent_last_admin_sync', '');
    $last_test_at   = get_option('epos_agent_last_test_at', 0);
    $last_error     = get_option('epos_agent_last_error', '');
    $portal_site    = get_option('epos_agent_portal_site_snapshot', []);
    $admin_users    = get_users(['role' => 'administrator']);
    $current_site_url = get_site_url();

    $status_meta = [
        'pending'      => ['label' => 'Pending',       'color' => '#dba617', 'bg' => '#fff8e5', 'icon' => 'dashicons-clock'],
        'connected'    => ['label' => 'Connected',     'color' => '#00a32a', 'bg' => '#edfaef', 'icon' => 'dashicons-yes-alt'],
        'disconnected' => ['label' => 'Disconnected',  'color' => '#b32d2e', 'bg' => '#fcecec', 'icon' => 'dashicons-warning'],
        'error'        => ['label' => 'Error',         'color' => '#b32d2e', 'bg' => '#fcecec', 'icon' => 'dashicons-dismiss'],
    ];
    $meta = $status_meta[$status] ?? $status_meta['pending'];

    $url_mismatch = false;
    if (!empty($portal_site['url']) && rtrim($portal_site['url'], '/') !== rtrim($current_site_url, '/')) {
        $url_mismatch = true;
    }
    ?>
    <div class="wrap epos-agent-wrap">
        <h1 class="wp-heading-inline">
            <span class="dashicons dashicons-cloud" style="font-size:30px;width:30px;height:30px;margin-right:6px;vertical-align:-4px;color:#2271b1;"></span>
            EPOS Agent
        </h1>
        <p class="description" style="margin-top:6px;">Connect this WordPress site to the EPOS Portal for monitoring, updates and security reporting.</p>

        <div id="epos-agent-toast" class="epos-toast" style="display:none;"></div>

        <div class="epos-grid">
            <!-- LEFT COLUMN: settings -->
            <div class="epos-col-main">

                <!-- Connection status card -->
                <div class="epos-card">
                    <div class="epos-card-header">
                        <h2><span class="dashicons dashicons-admin-network"></span> Connection Status</h2>
                    </div>
                    <div class="epos-card-body">
                        <div id="epos-status-pill" class="epos-pill" data-status="<?php echo esc_attr($status); ?>"
                             style="background:<?php echo esc_attr($meta['bg']); ?>;color:<?php echo esc_attr($meta['color']); ?>;">
                            <span class="dashicons <?php echo esc_attr($meta['icon']); ?>"></span>
                            <span class="epos-pill-label"><?php echo esc_html($meta['label']); ?></span>
                        </div>

                        <ul class="epos-meta">
                            <li>
                                <span class="epos-meta-key">Last test</span>
                                <span class="epos-meta-val" id="epos-last-test"><?php echo esc_html(epos_agent_format_relative($last_test_at)); ?></span>
                            </li>
                            <li>
                                <span class="epos-meta-key">Last error</span>
                                <span class="epos-meta-val" id="epos-last-error"><?php echo $last_error ? esc_html($last_error) : '&ndash;'; ?></span>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Portal credentials card -->
                <?php
                $creds_collapsed = ($status === 'connected') && !empty($portal_url) && !empty($api_key);
                ?>
                <div class="epos-card epos-credentials-card<?php echo $creds_collapsed ? ' is-collapsed' : ''; ?>" id="epos-credentials-card">
                    <div class="epos-card-header epos-card-header--split">
                        <h2><span class="dashicons dashicons-admin-network"></span> Portal Credentials</h2>
                        <button type="button" class="epos-toggle-credentials" id="epos-toggle-credentials"
                                aria-controls="epos-credentials-body" aria-expanded="<?php echo $creds_collapsed ? 'false' : 'true'; ?>">
                            <span class="epos-toggle-text"><?php echo $creds_collapsed ? 'Edit' : 'Hide'; ?></span>
                            <span class="dashicons dashicons-arrow-down-alt2 epos-toggle-icon"></span>
                        </button>
                    </div>

                    <div class="epos-card-summary" id="epos-credentials-summary">
                        <span class="dashicons dashicons-yes-alt"></span>
                        <span class="epos-summary-text">
                            Connected to <code id="epos-credentials-summary-url"><?php echo esc_html($portal_url); ?></code>
                        </span>
                    </div>

                    <div class="epos-card-body" id="epos-credentials-body">
                        <form id="epos-agent-form" onsubmit="return false;">
                            <?php wp_nonce_field('epos_agent_nonce', 'epos_agent_nonce'); ?>

                            <div class="epos-field">
                                <label for="epos_agent_portal_url">Portal URL</label>
                                <input type="url" id="epos_agent_portal_url" name="epos_agent_portal_url"
                                       value="<?php echo esc_attr($portal_url); ?>"
                                       placeholder="https://portal.yourdomain.com" autocomplete="off">
                                <p class="epos-help">The base URL of your EPOS Portal instance (without trailing slash).</p>
                            </div>

                            <div class="epos-field">
                                <label for="epos_agent_api_key">API Secret Key</label>
                                <div class="epos-input-group">
                                    <input type="password" id="epos_agent_api_key" name="epos_agent_api_key"
                                           value="<?php echo esc_attr($api_key); ?>"
                                           placeholder="Paste the key from the Portal" autocomplete="off">
                                    <button type="button" class="button" id="epos-toggle-key" title="Show / hide">
                                        <span class="dashicons dashicons-visibility"></span>
                                    </button>
                                    <button type="button" class="button" id="epos-copy-key" title="Copy to clipboard">
                                        <span class="dashicons dashicons-clipboard"></span>
                                    </button>
                                </div>
                                <p class="epos-help">Generated when this site was registered in the Portal. Keep it secret.</p>
                            </div>

                            <div class="epos-actions">
                                <button type="button" id="epos-save-btn" class="button button-primary">
                                    <span class="dashicons dashicons-saved"></span> Save &amp; Test
                                </button>
                                <button type="button" id="epos-test-btn" class="button">
                                    <span class="dashicons dashicons-update"></span> Test Connection
                                </button>
                                <span id="epos-action-spinner" class="spinner" style="float:none;margin-left:6px;"></span>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Admin sync card (sync now untouched) -->
                <div class="epos-card">
                    <div class="epos-card-header">
                        <h2><span class="dashicons dashicons-groups"></span> Admin Account Sync</h2>
                    </div>
                    <div class="epos-card-body">
                        <label class="epos-switch">
                            <input type="checkbox" id="epos_agent_admin_sync_enabled" <?php checked($sync_enabled); ?>>
                            <span>Automatically sync administrator accounts to Portal</span>
                        </label>

                        <h4 style="margin:18px 0 8px;">Current Administrators</h4>
                        <table class="widefat striped epos-table">
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
                                    <td><span class="dashicons dashicons-shield" style="color:#d63638;"></span> Administrator</td>
                                    <td><span class="epos-tag epos-tag-success">Active</span></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>

                        <p style="margin-top:14px;">
                            <button type="button" id="epos-agent-sync-now" class="button button-primary">
                                <span class="dashicons dashicons-update"></span> Sync Now
                            </button>
                            <span id="epos-agent-sync-status" style="margin-left:10px;"></span>
                        </p>
                        <p class="epos-help" style="margin-top:6px;">
                            <?php if ($last_sync) : ?>
                                Last synced: <strong><?php echo esc_html($last_sync); ?></strong>
                            <?php else : ?>
                                Never synced
                            <?php endif; ?>
                        </p>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: status panel + plugin info -->
            <div class="epos-col-aside">
                <!-- Live status panel -->
                <div class="epos-card">
                    <div class="epos-card-header">
                        <h2><span class="dashicons dashicons-chart-area"></span> Portal-Side Status</h2>
                    </div>
                    <div class="epos-card-body">
                        <div id="epos-portal-snapshot">
                            <?php if (!empty($portal_site)) : ?>
                                <?php echo epos_agent_render_snapshot($portal_site, $current_site_url); ?>
                            <?php else : ?>
                                <p class="epos-help" style="margin:0;">No data yet. Save settings and run <em>Test Connection</em> to populate.</p>
                            <?php endif; ?>
                        </div>

                        <?php if ($url_mismatch) : ?>
                            <div class="epos-warn" id="epos-url-warn">
                                <span class="dashicons dashicons-warning"></span>
                                <strong>URL mismatch:</strong> Portal has <code><?php echo esc_html($portal_site['url'] ?? ''); ?></code>
                                but this site is <code><?php echo esc_html($current_site_url); ?></code>. Update the Portal record so they match exactly.
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Plugin info -->
                <div class="epos-card">
                    <div class="epos-card-header">
                        <h2><span class="dashicons dashicons-admin-plugins"></span> Plugin Information</h2>
                    </div>
                    <div class="epos-card-body">
                        <table class="epos-info-table">
                            <tr><th>Plugin</th><td>v<?php echo esc_html(EPOS_AGENT_VERSION); ?></td></tr>
                            <tr><th>WordPress</th><td><?php echo esc_html(get_bloginfo('version')); ?></td></tr>
                            <tr><th>PHP</th><td><?php echo esc_html(phpversion()); ?></td></tr>
                            <tr><th>WooCommerce</th><td>
                                <?php echo class_exists('WooCommerce')
                                    ? '<span class="epos-tag epos-tag-success">Active</span>'
                                    : '<span class="epos-tag">Not Active</span>'; ?>
                            </td></tr>
                            <tr><th>Site URL</th><td><code><?php echo esc_html($current_site_url); ?></code></td></tr>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <style>
        .epos-agent-wrap { max-width:1200px; }
        .epos-toast {
            position:fixed; top:46px; right:20px; z-index:10000;
            padding:12px 16px; border-radius:6px; font-weight:500;
            box-shadow:0 4px 12px rgba(0,0,0,.12); min-width:240px;
        }
        .epos-toast.success { background:#edfaef; color:#0a3d18; border-left:4px solid #00a32a; }
        .epos-toast.error   { background:#fcecec; color:#3d0a0a; border-left:4px solid #b32d2e; }
        .epos-toast.info    { background:#e7f3ff; color:#0a253d; border-left:4px solid #2271b1; }

        .epos-grid { display:grid; grid-template-columns:2fr 1fr; gap:20px; margin-top:20px; }
        @media (max-width:960px) { .epos-grid { grid-template-columns:1fr; } }

        .epos-card { background:#fff; border:1px solid #dcdcde; border-radius:8px; margin-bottom:20px; overflow:hidden; }
        .epos-card-header { padding:14px 18px; border-bottom:1px solid #f0f0f1; background:#fafafa; }
        .epos-card-header h2 { margin:0; font-size:14px; font-weight:600; color:#1d2327; display:flex; align-items:center; gap:8px; }
        .epos-card-header .dashicons { color:#2271b1; }
        .epos-card-header--split { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .epos-card-body { padding:18px; }

        /* Collapsible Portal Credentials card */
        .epos-toggle-credentials {
            background:transparent; border:1px solid transparent; cursor:pointer;
            color:#2271b1; font-size:13px; font-weight:500;
            display:inline-flex; align-items:center; gap:4px;
            padding:4px 8px; border-radius:4px; line-height:1;
        }
        .epos-toggle-credentials:hover { background:#f0f6fc; color:#135e96; }
        .epos-toggle-credentials:focus { outline:none; box-shadow:0 0 0 1px #2271b1; }
        .epos-toggle-credentials .dashicons { font-size:16px; width:16px; height:16px; transition:transform .15s ease; color:inherit; }
        .epos-credentials-card.is-collapsed .epos-toggle-icon { transform:rotate(0deg); }
        .epos-credentials-card:not(.is-collapsed) .epos-toggle-icon { transform:rotate(180deg); }

        .epos-card-summary {
            display:none; align-items:center; gap:8px;
            padding:14px 18px; font-size:13px; color:#1d2327;
            background:#f6fbf7;
        }
        .epos-card-summary .dashicons { color:#00a32a; flex-shrink:0; }
        .epos-card-summary code {
            background:#fff; border:1px solid #e0e0e0; padding:2px 6px;
            border-radius:3px; font-size:12px; word-break:break-all;
        }
        .epos-credentials-card.is-collapsed .epos-card-summary { display:flex; }
        .epos-credentials-card.is-collapsed .epos-card-body { display:none; }

        .epos-pill {
            display:inline-flex; align-items:center; gap:6px;
            padding:6px 12px; border-radius:999px; font-weight:600; font-size:13px;
            margin-bottom:12px;
        }
        .epos-pill .dashicons { font-size:18px; width:18px; height:18px; }

        .epos-meta { list-style:none; margin:0; padding:0; }
        .epos-meta li { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #f0f0f1; font-size:13px; }
        .epos-meta li:last-child { border-bottom:none; }
        .epos-meta-key { color:#646970; }
        .epos-meta-val { color:#1d2327; font-weight:500; max-width:60%; text-align:right; word-break:break-word; }

        .epos-field { margin-bottom:16px; }
        .epos-field label { display:block; font-weight:600; margin-bottom:6px; color:#1d2327; }
        .epos-field input[type="url"],
        .epos-field input[type="text"],
        .epos-field input[type="password"] {
            width:100%; padding:8px 10px; border:1px solid #c3c4c7; border-radius:4px;
            box-shadow:0 0 0 transparent; font-size:13px;
        }
        .epos-field input:focus { border-color:#2271b1; box-shadow:0 0 0 1px #2271b1; outline:none; }
        .epos-help { color:#646970; font-size:12px; margin:6px 0 0; }

        .epos-input-group { display:flex; gap:6px; }
        .epos-input-group input { flex:1; }
        .epos-input-group .button { padding:0 10px; height:36px; }

        .epos-actions { display:flex; align-items:center; gap:8px; margin-top:8px; }
        /* Make every button render dashicon + label on the same baseline. */
        .epos-agent-wrap .button { display:inline-flex; align-items:center; gap:6px; line-height:1; }
        .epos-agent-wrap .button .dashicons { font-size:16px; width:16px; height:16px; line-height:1; margin:0; vertical-align:middle; }
        .spinner.is-active, .spinner { visibility:hidden; }
        .spinner.is-active { visibility:visible; }

        .epos-switch { display:flex; align-items:center; gap:10px; font-size:13px; }
        .epos-switch input { margin:0; }

        .epos-table { max-width:100%; }
        .epos-tag { display:inline-block; padding:2px 8px; border-radius:4px; background:#f0f0f1; color:#1d2327; font-size:12px; font-weight:500; }
        .epos-tag-success { background:#edfaef; color:#0a3d18; }

        .epos-info-table { width:100%; }
        .epos-info-table th { text-align:left; padding:6px 0; color:#646970; font-weight:500; font-size:13px; width:40%; }
        .epos-info-table td { padding:6px 0; font-size:13px; color:#1d2327; }
        .epos-info-table code { font-size:11px; word-break:break-all; }

        .epos-warn {
            margin-top:14px; padding:10px 12px; border-radius:6px;
            background:#fff8e5; border-left:4px solid #dba617; color:#3d2e0a;
            font-size:13px; line-height:1.5;
        }
        .epos-warn .dashicons { color:#dba617; vertical-align:-3px; margin-right:4px; }
        .epos-warn code { background:rgba(0,0,0,.05); padding:1px 5px; border-radius:3px; font-size:12px; }

        #epos-portal-snapshot ul { list-style:none; margin:0; padding:0; }
        #epos-portal-snapshot li { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #f0f0f1; font-size:13px; }
        #epos-portal-snapshot li:last-child { border-bottom:none; }
        #epos-portal-snapshot .k { color:#646970; }
        #epos-portal-snapshot .v { color:#1d2327; font-weight:500; max-width:60%; text-align:right; word-break:break-word; }
        </style>

        <script type="text/javascript">
        (function($) {
            var nonce       = '<?php echo wp_create_nonce('epos_agent_nonce'); ?>';
            var siteUrl     = <?php echo wp_json_encode($current_site_url); ?>;
            var $toast      = $('#epos-agent-toast');
            var $spinner    = $('#epos-action-spinner');
            var $statusPill = $('#epos-status-pill');
            var $snapshot   = $('#epos-portal-snapshot');
            var $credCard   = $('#epos-credentials-card');
            var $credToggle = $('#epos-toggle-credentials');
            var $credSummaryUrl = $('#epos-credentials-summary-url');
            var userToggledCreds = false;

            function setCredentialsCollapsed(collapsed) {
                $credCard.toggleClass('is-collapsed', !!collapsed);
                $credToggle.attr('aria-expanded', collapsed ? 'false' : 'true');
                $credToggle.find('.epos-toggle-text').text(collapsed ? 'Edit' : 'Hide');
            }

            $credToggle.on('click', function() {
                userToggledCreds = true;
                setCredentialsCollapsed(!$credCard.hasClass('is-collapsed'));
            });

            function showToast(type, msg) {
                $toast.removeClass('success error info').addClass(type).html(msg).fadeIn(120);
                clearTimeout(showToast._t);
                showToast._t = setTimeout(function() { $toast.fadeOut(200); }, 4500);
            }

            function setBusy(busy) {
                $spinner.toggleClass('is-active', !!busy);
                $('#epos-save-btn, #epos-test-btn').prop('disabled', !!busy);
            }

            function updateStatusPill(status, label) {
                var meta = {
                    pending:      { color:'#dba617', bg:'#fff8e5', icon:'dashicons-clock',   label:'Pending' },
                    connected:    { color:'#00a32a', bg:'#edfaef', icon:'dashicons-yes-alt', label:'Connected' },
                    disconnected: { color:'#b32d2e', bg:'#fcecec', icon:'dashicons-warning', label:'Disconnected' },
                    error:        { color:'#b32d2e', bg:'#fcecec', icon:'dashicons-dismiss', label:'Error' }
                }[status] || { color:'#dba617', bg:'#fff8e5', icon:'dashicons-clock', label:label || status };

                $statusPill.attr('data-status', status)
                    .css({ background: meta.bg, color: meta.color })
                    .find('.dashicons').attr('class', 'dashicons ' + meta.icon).end()
                    .find('.epos-pill-label').text(meta.label);
            }

            function renderSnapshot(site, sentUrl) {
                if (!site) { return; }
                var rows = [
                    ['Name in Portal',  site.name || '—'],
                    ['Portal status',   site.status || '—'],
                    ['URL in Portal',   site.url ? '<code>' + site.url + '</code>' : '—'],
                    ['URL we sent',     sentUrl ? '<code>' + sentUrl + '</code>' : '—'],
                    ['WP version',      site.wp_version || '—'],
                    ['PHP version',     site.php_version || '—'],
                    ['WooCommerce',     site.woo_active ? 'Active' : 'Not Active'],
                    ['Last ping',       site.last_ping_at ? new Date(site.last_ping_at).toLocaleString() : '—']
                ];
                var html = '<ul>';
                rows.forEach(function(r) {
                    html += '<li><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></li>';
                });
                html += '</ul>';
                $snapshot.html(html);

                // URL mismatch warning (insert / remove dynamically)
                var $warn = $('#epos-url-warn');
                var portalUrl = (site.url || '').replace(/\/$/, '');
                var sent      = (sentUrl || '').replace(/\/$/, '');
                if (portalUrl && sent && portalUrl !== sent) {
                    var warnHtml = '<div class="epos-warn" id="epos-url-warn">'
                        + '<span class="dashicons dashicons-warning"></span>'
                        + '<strong>URL mismatch:</strong> Portal has <code>' + portalUrl + '</code> '
                        + 'but this site is <code>' + sent + '</code>. Update the Portal record so they match exactly.'
                        + '</div>';
                    if ($warn.length) { $warn.replaceWith(warnHtml); }
                    else { $snapshot.after(warnHtml); }
                } else if ($warn.length) {
                    $warn.remove();
                }
            }

            function applyResult(res) {
                if (res && res.connection_status) {
                    updateStatusPill(res.connection_status);

                    // Auto manage credentials collapse based on connection state.
                    // The user's manual choice (during this page session) is respected,
                    // except an error always re-expands so they can fix it.
                    if (res.connection_status === 'connected') {
                        var portalUrlVal = $('#epos_agent_portal_url').val() || '';
                        if (portalUrlVal) { $credSummaryUrl.text(portalUrlVal); }
                        if (!userToggledCreds) {
                            setCredentialsCollapsed(true);
                        }
                    } else if (res.connection_status === 'error' || res.connection_status === 'disconnected') {
                        setCredentialsCollapsed(false);
                    }
                }
                if (res && res.site) {
                    renderSnapshot(res.site, res.site_url_sent);
                }
                if (res && res.last_test_human) {
                    $('#epos-last-test').text(res.last_test_human);
                }
                if (res && typeof res.last_error !== 'undefined') {
                    $('#epos-last-error').text(res.last_error || '—');
                }
            }

            // Save & Test
            $('#epos-save-btn').on('click', function() {
                setBusy(true);
                $.post(ajaxurl, {
                    action: 'epos_agent_save_settings',
                    nonce:  nonce,
                    portal_url:  $('#epos_agent_portal_url').val(),
                    api_key:     $('#epos_agent_api_key').val(),
                    sync_enabled: $('#epos_agent_admin_sync_enabled').is(':checked') ? 1 : 0
                }).done(function(resp) {
                    if (resp.success) {
                        applyResult(resp.data);
                        showToast('success', resp.data.message || 'Saved and connected.');
                    } else {
                        applyResult(resp.data);
                        showToast('error', (resp.data && resp.data.message) || 'Save failed.');
                    }
                }).fail(function() {
                    showToast('error', 'Network error — could not reach WordPress.');
                }).always(function() { setBusy(false); });
            });

            // Test Connection only
            $('#epos-test-btn').on('click', function() {
                setBusy(true);
                $.post(ajaxurl, {
                    action: 'epos_agent_test_connection',
                    nonce:  nonce
                }).done(function(resp) {
                    applyResult(resp.data || {});
                    if (resp.success) {
                        showToast('success', (resp.data && resp.data.message) || 'Connected.');
                    } else {
                        showToast('error', (resp.data && resp.data.message) || 'Connection failed.');
                    }
                }).fail(function() {
                    showToast('error', 'Network error — could not reach WordPress.');
                }).always(function() { setBusy(false); });
            });

            // Show / hide key
            $('#epos-toggle-key').on('click', function() {
                var $i = $('#epos_agent_api_key');
                var $ic = $(this).find('.dashicons');
                if ($i.attr('type') === 'password') {
                    $i.attr('type', 'text');
                    $ic.removeClass('dashicons-visibility').addClass('dashicons-hidden');
                } else {
                    $i.attr('type', 'password');
                    $ic.removeClass('dashicons-hidden').addClass('dashicons-visibility');
                }
            });

            // Copy key
            $('#epos-copy-key').on('click', function() {
                var v = $('#epos_agent_api_key').val();
                if (!v) { showToast('info', 'Nothing to copy.'); return; }
                navigator.clipboard.writeText(v).then(
                    function() { showToast('success', 'API key copied.'); },
                    function() { showToast('error', 'Could not copy.'); }
                );
            });

            // Existing Sync Now flow (unchanged behaviour, kept here so it lives with the rest of the page)
            $('#epos-agent-sync-now').on('click', function() {
                var $btn = $(this);
                var $status = $('#epos-agent-sync-status');
                $btn.prop('disabled', true);
                $status.html('');

                $.post(ajaxurl, {
                    action: 'epos_agent_manual_sync',
                    nonce:  nonce
                }).done(function(response) {
                    if (response.success) {
                        $status.html('<span class="epos-tag epos-tag-success">' + (response.data.message || 'Synced') + '</span>');
                    } else {
                        $status.html('<span style="color:#b32d2e;">' + ((response.data && response.data.message) || 'Sync failed') + '</span>');
                    }
                }).fail(function() {
                    $status.html('<span style="color:#b32d2e;">Request failed</span>');
                }).always(function() {
                    $btn.prop('disabled', false);
                });
            });
        })(jQuery);
        </script>
    </div>
    <?php
}

/**
 * Render the right-side portal snapshot as HTML (used on first paint).
 */
function epos_agent_render_snapshot($site, $current_site_url) {
    $rows = [
        'Name in Portal'  => $site['name'] ?? '—',
        'Portal status'   => $site['status'] ?? '—',
        'URL in Portal'   => !empty($site['url']) ? '<code>' . esc_html($site['url']) . '</code>' : '—',
        'URL we send'     => '<code>' . esc_html($current_site_url) . '</code>',
        'WP version'      => $site['wp_version'] ?? '—',
        'PHP version'     => $site['php_version'] ?? '—',
        'WooCommerce'     => !empty($site['woo_active']) ? 'Active' : 'Not Active',
        'Last ping'       => !empty($site['last_ping_at'])
            ? esc_html(date('Y-m-d H:i', strtotime($site['last_ping_at'])))
            : '—',
    ];

    $html = '<ul>';
    foreach ($rows as $k => $v) {
        $html .= '<li><span class="k">' . esc_html($k) . '</span><span class="v">' . $v . '</span></li>';
    }
    $html .= '</ul>';
    return $html;
}

/**
 * Build the standard JSON response payload that the JS expects.
 */
function epos_agent_build_response_payload($handshake_details) {
    $status        = get_option('epos_agent_connection_status', 'pending');
    $last_test_at  = get_option('epos_agent_last_test_at', 0);
    $last_error    = get_option('epos_agent_last_error', '');

    return [
        'connection_status' => $status,
        'last_test_human'   => epos_agent_format_relative($last_test_at),
        'last_error'        => $last_error,
        'site'              => $handshake_details['site'] ?? null,
        'site_url_sent'     => $handshake_details['site_url_sent'] ?? '',
        'message'           => $handshake_details['message'] ?? '',
    ];
}

// ─── AJAX: Save settings (saves options + runs handshake + returns enriched state) ───
add_action('wp_ajax_epos_agent_save_settings', 'epos_agent_handle_save_settings');

function epos_agent_handle_save_settings() {
    check_ajax_referer('epos_agent_nonce', 'nonce');
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }

    $portal_url   = isset($_POST['portal_url']) ? esc_url_raw(wp_unslash($_POST['portal_url'])) : '';
    $api_key      = isset($_POST['api_key']) ? sanitize_text_field(wp_unslash($_POST['api_key'])) : '';
    $sync_enabled = !empty($_POST['sync_enabled']);

    update_option('epos_agent_portal_url', $portal_url);
    update_option('epos_agent_api_key', $api_key);
    update_option('epos_agent_admin_sync_enabled', $sync_enabled);

    if (empty($portal_url) || empty($api_key)) {
        update_option('epos_agent_connection_status', 'pending');
        wp_send_json_success(array_merge(
            epos_agent_build_response_payload([]),
            ['message' => 'Saved. Enter both fields and click Test Connection.']
        ));
    }

    $details = Epos_Agent_Activator::perform_handshake($portal_url, $api_key, true);

    if (!empty($details['site'])) {
        update_option('epos_agent_portal_site_snapshot', $details['site']);
    }

    $payload = epos_agent_build_response_payload($details);
    $payload['message'] = $details['success']
        ? 'Saved and connected to the Portal.'
        : ('Saved, but connection failed: ' . ($details['message'] ?? 'Unknown error.'));

    if ($details['success']) {
        wp_send_json_success($payload);
    }
    wp_send_json_error($payload);
}

// ─── AJAX: Test Connection (runs handshake against currently saved options) ───
add_action('wp_ajax_epos_agent_test_connection', 'epos_agent_handle_test_connection');

function epos_agent_handle_test_connection() {
    check_ajax_referer('epos_agent_nonce', 'nonce');
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }

    $portal_url = get_option('epos_agent_portal_url', '');
    $api_key    = get_option('epos_agent_api_key', '');

    if (empty($portal_url) || empty($api_key)) {
        wp_send_json_error(array_merge(
            epos_agent_build_response_payload([]),
            ['message' => 'Enter Portal URL and API Key first.']
        ));
    }

    $details = Epos_Agent_Activator::perform_handshake($portal_url, $api_key, true);

    if (!empty($details['site'])) {
        update_option('epos_agent_portal_site_snapshot', $details['site']);
    }

    $payload = epos_agent_build_response_payload($details);
    $payload['message'] = $details['success']
        ? 'Connected to the Portal.'
        : ('Connection failed: ' . ($details['message'] ?? 'Unknown error.'));

    if ($details['success']) {
        wp_send_json_success($payload);
    }
    wp_send_json_error($payload);
}

// ─── AJAX: Manual admin sync (unchanged behaviour) ───
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

// Hook SMTP configuration into phpmailer for all outgoing emails (kept from original).
add_action('phpmailer_init', ['Epos_Agent_Smtp_Config', 'configure_phpmailer']);
