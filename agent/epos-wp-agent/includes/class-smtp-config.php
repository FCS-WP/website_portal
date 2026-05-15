<?php
/**
 * Handles SMTP configuration updates from the Portal.
 */
class Epos_Agent_Smtp_Config {

    /**
     * Update SMTP settings on this site
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public function update($request) {
        $settings = [
            'host'       => sanitize_text_field($request->get_param('host')),
            'port'       => absint($request->get_param('port')),
            'username'   => sanitize_text_field($request->get_param('username')),
            'password'   => $request->get_param('password'), // Don't sanitize passwords
            'encryption' => sanitize_text_field($request->get_param('encryption')),
            'from_email' => sanitize_email($request->get_param('from_email')),
            'from_name'  => sanitize_text_field($request->get_param('from_name')),
        ];

        // Store SMTP settings in WordPress options
        update_option('epos_smtp_host', $settings['host']);
        update_option('epos_smtp_port', $settings['port']);
        update_option('epos_smtp_username', $settings['username']);
        update_option('epos_smtp_password', $settings['password']);
        update_option('epos_smtp_encryption', $settings['encryption']);
        update_option('epos_smtp_from_email', $settings['from_email']);
        update_option('epos_smtp_from_name', $settings['from_name']);

        // Hook into phpmailer to apply SMTP settings
        // This is done via the wp_mail filter in WordPress
        update_option('epos_smtp_enabled', true);

        return new \WP_REST_Response([
            'success' => true,
            'message' => 'SMTP settings updated successfully.',
        ], 200);
    }

    /**
     * Send a test email using the configured SMTP settings
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public function test($request) {
        $to_email = sanitize_email($request->get_param('to_email'));

        if (empty($to_email)) {
            return new \WP_REST_Response([
                'success' => false,
                'message' => 'to_email is required.',
            ], 400);
        }

        // Apply SMTP settings for this request
        add_action('phpmailer_init', [self::class, 'configure_phpmailer']);

        $subject = 'EPOS Portal - SMTP Test Email';
        $message = 'This is a test email from the EPOS WP Agent plugin. If you received this, your SMTP configuration is working correctly.';

        $sent = wp_mail($to_email, $subject, $message);

        if ($sent) {
            return new \WP_REST_Response([
                'success' => true,
                'message' => 'Test email sent successfully to ' . $to_email,
            ], 200);
        }

        return new \WP_REST_Response([
            'success' => false,
            'message' => 'Failed to send test email. Check SMTP settings.',
        ], 500);
    }

    /**
     * Configure PHPMailer with stored SMTP settings
     */
    public static function configure_phpmailer($phpmailer) {
        $host = get_option('epos_smtp_host', '');
        
        if (empty($host)) {
            return;
        }

        $phpmailer->isSMTP();
        $phpmailer->Host       = $host;
        $phpmailer->Port       = get_option('epos_smtp_port', 587);
        $phpmailer->Username   = get_option('epos_smtp_username', '');
        $phpmailer->Password   = get_option('epos_smtp_password', '');
        $phpmailer->SMTPAuth   = true;
        $phpmailer->From       = get_option('epos_smtp_from_email', '');
        $phpmailer->FromName   = get_option('epos_smtp_from_name', '');

        $encryption = get_option('epos_smtp_encryption', 'tls');
        if ($encryption !== 'none') {
            $phpmailer->SMTPSecure = $encryption;
        }
    }
}
