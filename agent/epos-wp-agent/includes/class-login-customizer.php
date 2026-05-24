<?php
/**
 * Hides wp-login.php behind /epos-login and replaces the stock login UI
 * with a Zippy-branded two-column page. Toggle off per-site by setting
 * wp_option `epos_login_customizer_enabled` to '0'.
 */
class Epos_Agent_Login_Customizer {

    const LOGIN_SLUG  = 'epos-login';
    const OPT_ENABLED = 'epos_login_customizer_enabled';

    public static function init() {
        if (!self::is_enabled()) {
            return;
        }

        // We're already inside epos_agent_init() (hooked on `init`), so a
        // nested add_action('init', ...) would never fire. Register
        // synchronously instead.
        self::register_rewrite();
        add_filter('query_vars', [self::class, 'register_query_var']);

        // parse_request runs before redirect_canonical, so the slug can't
        // be 301'd into a trailing-slash variant before we hand off.
        add_action('parse_request', [self::class, 'serve_login_on_slug']);
        add_filter('redirect_canonical', [self::class, 'maybe_block_canonical_redirect'], 10, 2);

        add_action('login_init', [self::class, 'block_direct_wp_login']);

        add_filter('site_url', [self::class, 'filter_login_urls'], 10, 4);
        add_filter('network_site_url', [self::class, 'filter_login_urls'], 10, 3);
        add_filter('wp_redirect', [self::class, 'filter_login_redirect'], 10, 2);

        add_action('login_enqueue_scripts', [self::class, 'enqueue_assets']);
        add_filter('login_headerurl', [self::class, 'header_url']);
        add_filter('login_headertext', [self::class, 'header_text']);
        add_action('login_header', [self::class, 'open_layout']);
        add_action('login_footer', [self::class, 'close_layout']);
        add_filter('login_body_class', [self::class, 'body_class']);
    }

    public static function is_enabled() {
        return (bool) get_option(self::OPT_ENABLED, true);
    }

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

    public static function serve_login_on_slug($wp) {
        if (empty($wp->query_vars[self::LOGIN_SLUG]) || $wp->query_vars[self::LOGIN_SLUG] !== '1') {
            return;
        }

        // $_REQUEST is built once at request start from $_GET/$_POST/$_COOKIE;
        // mutating $_GET alone doesn't update it, so write all three for
        // block_direct_wp_login() to see the marker.
        $_GET['epos_login_via_slug']     = '1';
        $_POST['epos_login_via_slug']    = '1';
        $_REQUEST['epos_login_via_slug'] = '1';

        require_once ABSPATH . 'wp-login.php';
        exit;
    }

    public static function maybe_block_canonical_redirect($redirect_url, $requested_url) {
        $req_path = is_string($requested_url) ? wp_parse_url($requested_url, PHP_URL_PATH) : '';
        if (is_string($req_path) && preg_match('#(^|/)' . preg_quote(self::LOGIN_SLUG, '#') . '/?$#', $req_path)) {
            return false;
        }
        return $redirect_url;
    }

    public static function block_direct_wp_login() {
        if (isset($_REQUEST['epos_login_via_slug'])) {
            return;
        }

        $action = isset($_REQUEST['action']) ? sanitize_key($_REQUEST['action']) : '';
        if ($action === 'logout') {
            return;
        }

        // The POST submission's form action is wp-login.php and carries no
        // marker; trust it when the Referer points at our slug.
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
        $template = get_404_template();
        if ($template && file_exists($template)) {
            include $template;
        } else {
            echo '<!doctype html><title>Not Found</title><h1>404 — Not Found</h1>';
        }
        exit;
    }

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

    public static function enqueue_assets() {
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

        ?>
        <script>window.EPOS_LOGIN = <?php echo wp_json_encode(['forgotUrl' => $forgot_url]); ?>;</script>
        <?php
    }
}
