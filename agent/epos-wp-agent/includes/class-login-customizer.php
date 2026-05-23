<?php
/**
 * Login Customizer
 *
 * Two things:
 *
 *   1. URL rewrite — /epos-login serves the WordPress login. Direct hits to
 *      wp-login.php return 404 so bot probes against the canonical URL fail
 *      without revealing whether the site runs WordPress.
 *
 *   2. UI override — a two-column Zippy-branded login page replaces the
 *      stock WordPress one. The left column hosts the actual <form> (so
 *      WordPress's auth flow is untouched); the right column is a static
 *      banner with floating "feature" cards.
 *
 * The customizer can be toggled off without uninstalling the plugin by
 * setting wp_option `epos_login_customizer_enabled` to false (defaults to
 * true). When disabled, both the URL rewrite and the UI swap are no-ops.
 *
 * Activator must flush rewrite rules so /epos-login is recognized; the
 * existing Epos_Agent_Activator already calls flush_rewrite_rules() so we
 * piggy-back on that.
 */
class Epos_Agent_Login_Customizer {

    /** Slug for the new login URL (path segment after the home URL). */
    const LOGIN_SLUG = 'epos-login';

    /** wp_option name used to disable the whole feature per-site. */
    const OPT_ENABLED = 'epos_login_customizer_enabled';

    public static function init() {
        if (!self::is_enabled()) {
            return;
        }

        // ── URL rewrite ────────────────────────────────────────────────
        // Add a rewrite rule and a query var so /epos-login routes through
        // WordPress (rather than the webserver) and we can detect the hit.
        //
        // Call register_rewrite() DIRECTLY rather than hooking it on `init`:
        // this init() method is itself called from epos_agent_init() which
        // already runs on `init`. Adding a nested init action would queue
        // the rule registration AFTER WP has finished processing init
        // hooks — so the rule never lands in the persistent rules table
        // until something else (activation, permalinks save) triggers a
        // flush, and even then only if the request happens to load before
        // our nested hook is bypassed.
        self::register_rewrite();
        add_filter('query_vars', [self::class, 'register_query_var']);

        // When the rewrite matches, hand off to wp-login.php internally.
        // Hook on `parse_request` (which fires before `redirect_canonical`)
        // so WP doesn't try to "fix" the slug into something else and 404.
        add_action('parse_request', [self::class, 'serve_login_on_slug']);

        // Suppress canonical redirect (e.g. /epos-login -> /epos-login/) for
        // our slug; we want the rewrite-driven handoff to fire on the bare
        // URL, not after a 301 round-trip.
        add_filter('redirect_canonical', [self::class, 'maybe_block_canonical_redirect'], 10, 2);

        // Block direct access to wp-login.php. Anyone hitting it gets a
        // 404 (so we don't leak the fact that this is a WordPress site).
        // The internal handoff above sets a flag that lets the real
        // wp-login.php through.
        add_action('login_init', [self::class, 'block_direct_wp_login']);

        // Rewrite every wp-login.php URL the WP core emits (e.g.
        // wp_login_url(), wp_lostpassword_url()) to /epos-login so links
        // in emails, redirects, and the "Log in" links don't expose the
        // hidden URL.
        add_filter('site_url', [self::class, 'filter_login_urls'], 10, 4);
        add_filter('network_site_url', [self::class, 'filter_login_urls'], 10, 3);
        add_filter('wp_redirect', [self::class, 'filter_login_redirect'], 10, 2);

        // ── UI override ────────────────────────────────────────────────
        add_action('login_enqueue_scripts', [self::class, 'enqueue_assets']);
        add_action('login_head', [self::class, 'inject_head']);
        add_filter('login_headerurl', [self::class, 'header_url']);
        add_filter('login_headertext', [self::class, 'header_text']);

        // Wrap the WP login form in our two-column layout. login_form_top
        // fires inside the existing <form>, so we open our left-column DOM
        // BEFORE the form via login_header, and close + render the right
        // column AFTER the form via login_footer.
        add_action('login_header', [self::class, 'open_layout']);
        add_action('login_footer', [self::class, 'close_layout']);

        // Suppress the default WordPress logo/links/etc. by adding a body
        // class our CSS targets.
        add_filter('login_body_class', [self::class, 'body_class']);
    }

    // ─── Toggle ──────────────────────────────────────────────────────

    public static function is_enabled() {
        return (bool) get_option(self::OPT_ENABLED, true);
    }

    // ─── Rewrite + hide wp-login.php ─────────────────────────────────

    public static function register_rewrite() {
        add_rewrite_rule(
            '^' . self::LOGIN_SLUG . '/?$',
            'index.php?' . self::LOGIN_SLUG . '=1',
            'top'
        );
    }

    public static function register_query_var($vars) {
        $vars[] = self::LOGIN_SLUG;
        return $vars;
    }

    /**
     * When the request matches /epos-login, hand control to wp-login.php
     * with a marker so block_direct_wp_login() lets it through.
     *
     * Hooked on `parse_request` (not `template_redirect`) so we run BEFORE
     * `redirect_canonical` decides to 301 the slug into something else.
     * The hook passes the WP object; we inspect query_vars directly because
     * get_query_var() isn't populated yet at this stage.
     */
    public static function serve_login_on_slug($wp) {
        if (empty($wp->query_vars[self::LOGIN_SLUG]) || $wp->query_vars[self::LOGIN_SLUG] !== '1') {
            return;
        }

        // Mark this request so block_direct_wp_login() lets it through.
        // $_REQUEST is built from $_GET/$_POST/$_COOKIE at request start,
        // so we must update it explicitly (modifying $_GET alone is not
        // enough). All three are written to cover any future check.
        $_GET['epos_login_via_slug']     = '1';
        $_POST['epos_login_via_slug']    = '1';
        $_REQUEST['epos_login_via_slug'] = '1';

        require_once ABSPATH . 'wp-login.php';
        exit;
    }

    /**
     * Cancel the canonical redirect that would otherwise 301 our slug into
     * a trailing-slash variant (or "fix" it into a 404). Without this, WP's
     * redirect_canonical kicks in BEFORE our parse_request handoff runs.
     */
    public static function maybe_block_canonical_redirect($redirect_url, $requested_url) {
        $req_path = is_string($requested_url) ? wp_parse_url($requested_url, PHP_URL_PATH) : '';
        if (is_string($req_path) && preg_match('#(^|/)' . preg_quote(self::LOGIN_SLUG, '#') . '/?$#', $req_path)) {
            return false;
        }
        return $redirect_url;
    }

    /**
     * Return 404 for direct hits to wp-login.php unless we routed there
     * ourselves via /epos-login. We can't 404 *too* early — wp-login.php
     * needs to be reachable for the form action POST. We check the
     * marker set in serve_login_on_slug() to distinguish.
     */
    public static function block_direct_wp_login() {
        if (isset($_REQUEST['epos_login_via_slug'])) {
            return;
        }

        // Allow logged-in users (they may be hitting wp-login.php to log out)
        // and the logout action itself.
        $action = isset($_REQUEST['action']) ? sanitize_key($_REQUEST['action']) : '';
        if ($action === 'logout') {
            return;
        }

        // For the POST submission, the form action lives at wp-login.php
        // and won't carry our marker. Detect this by Referer pointing at
        // /epos-login on the same host.
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $referer = isset($_SERVER['HTTP_REFERER']) ? wp_parse_url($_SERVER['HTTP_REFERER']) : null;
            $home    = wp_parse_url(home_url('/'));
            if (
                $referer &&
                isset($referer['host'], $home['host']) &&
                $referer['host'] === $home['host'] &&
                isset($referer['path']) &&
                strpos($referer['path'], '/' . self::LOGIN_SLUG) !== false
            ) {
                return;
            }
        }

        status_header(404);
        nocache_headers();
        global $wp_query;
        if ($wp_query) {
            $wp_query->set_404();
        }
        // Render the theme's 404 template if available, otherwise a minimal body.
        $template = get_404_template();
        if ($template && file_exists($template)) {
            include $template;
        } else {
            echo '<!doctype html><title>Not Found</title><h1>404 — Not Found</h1>';
        }
        exit;
    }

    /**
     * Rewrite outgoing wp-login.php URLs (login, logout, lostpassword) to
     * /epos-login so the real path never appears in emails or redirects.
     */
    public static function filter_login_urls($url, $path = '', $scheme = null, $blog_id = null) {
        if (strpos($url, 'wp-login.php') === false) {
            return $url;
        }
        return str_replace('wp-login.php', self::LOGIN_SLUG, $url);
    }

    public static function filter_login_redirect($location, $status) {
        if (is_string($location) && strpos($location, 'wp-login.php') !== false) {
            $location = str_replace('wp-login.php', self::LOGIN_SLUG, $location);
        }
        return $location;
    }

    // ─── UI override ─────────────────────────────────────────────────

    public static function enqueue_assets() {
        // Load Google fonts inline-via-CSS rather than a separate enqueue,
        // because the login screen tends to dequeue arbitrary handles.
        wp_enqueue_style(
            'epos-login-customizer',
            EPOS_AGENT_PLUGIN_URL . 'assets/css/login.css',
            [],
            EPOS_AGENT_VERSION
        );
        wp_enqueue_script(
            'epos-login-customizer',
            EPOS_AGENT_PLUGIN_URL . 'assets/js/login.js',
            [],
            EPOS_AGENT_VERSION,
            true
        );
    }

    public static function inject_head() {
        // Nothing currently — kept as a hook for future per-site overrides.
    }

    public static function header_url() {
        return home_url('/');
    }

    public static function header_text() {
        return get_bloginfo('name');
    }

    public static function body_class($classes) {
        $classes[] = 'epos-login-page';
        return $classes;
    }

    /**
     * Renders the opening DOM that wraps the WordPress login form. WordPress
     * emits the form INSIDE the .epos-form-pane div thanks to the CSS grid
     * — there's no DOM-reparent, the form just lives in the left column.
     */
    public static function open_layout() {
        $logo_url = EPOS_AGENT_PLUGIN_URL . 'assets/images/logo-zippy.png';
        ?>
        <main class="epos-login-page" aria-labelledby="epos-login-title">
          <div class="epos-grain" aria-hidden="true"></div>
          <section class="epos-auth-shell" aria-label="Admin login">
            <aside class="epos-form-pane">
              <div class="epos-brand-mini" aria-label="Zippy Admin">
                <img class="epos-brand-mark" src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>" />
                <span>Zippy Admin</span>
              </div>
              <div class="epos-form-wrap">
                <h1 id="epos-login-title">Admin sign in</h1>
                <p class="epos-intro">A cleaner login experience with the form separated on the left and a calm branded banner on the right.</p>
                <div class="epos-form-pane__form">
        <?php
    }

    /**
     * Closes the left column, renders the right banner column, plus the
     * floating-cube widget cards. Hooked to login_footer so it runs AFTER
     * the WordPress form output.
     */
    public static function close_layout() {
        $forgot_url = wp_lostpassword_url();
        $home_url   = home_url('/');
        $home_name  = get_bloginfo('name');
        ?>
                </div><!-- /.epos-form-pane__form -->
                <p class="epos-form-note" role="status" aria-live="polite">Tip: only use remember sign-in on trusted internal devices.</p>
              </div><!-- /.epos-form-wrap -->
              <div class="epos-footer-links">
                <a class="epos-return-link" href="<?php echo esc_url($home_url); ?>">&larr; Back to <?php echo esc_html($home_name); ?></a>
                <button class="epos-lang-button" type="button">EN</button>
              </div>
            </aside>

            <section class="epos-banner-column" aria-label="Company banner">
              <div class="epos-mesh-lines" aria-hidden="true"></div>

              <div class="epos-floating-card epos-card-a" aria-hidden="true">
                <div class="epos-metric">2FA</div>
                <div class="epos-metric-label">Ready for admin verification</div>
              </div>
              <div class="epos-floating-card epos-card-b" aria-hidden="true">
                <div class="epos-metric">99.9</div>
                <div class="epos-metric-label">Uptime for website operations</div>
              </div>

              <div class="epos-banner-content">
                <span class="epos-banner-kicker">Company portal &bull; Admin area</span>
                <p class="epos-zippy-word" aria-label="Zippy">zippy</p>
                <h2 class="epos-banner-title">Manage content faster, clearer, and safer.</h2>
                <p class="epos-banner-copy">The right banner gives the admin login a stronger brand presence while keeping motion soft, readable, and out of the way.</p>

                <div class="epos-security-strip" aria-label="Security highlights">
                  <span class="epos-chip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    SSL ready
                  </span>
                  <span class="epos-chip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.8 3 8.5 7 10 4-1.5 7-5.2 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8"/></svg>
                    Admin guard
                  </span>
                  <span class="epos-chip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    Subtle motion
                  </span>
                </div>
              </div>

              <div class="epos-toast" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3 5 6v5c0 4.8 3 8.5 7 10 4-1.5 7-5.2 7-10V6l-7-3Z" fill="rgba(255,255,255,.18)"/>
                  <path d="m8.7 12.2 2 2 4.6-5" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>
                  <strong>Secure session</strong>
                  <span>Login activity monitored for admin users.</span>
                </span>
              </div>
            </section>
          </section><!-- /.epos-auth-shell -->
        </main>

        <?php
        // Hidden helper: store the forgot-password URL so login.js can
        // turn the "Forgot password?" link into a real anchor at runtime
        // (we can't print it directly inside the WP-rendered <form>).
        ?>
        <script>window.EPOS_LOGIN = <?php echo wp_json_encode(['forgotUrl' => $forgot_url]); ?>;</script>
        <?php
    }
}
