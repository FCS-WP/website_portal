<?php
/**
 * EPOS WP Agent - Plugin Updater
 * Hooks into WordPress update system to check for company plugin updates from the Portal.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Epos_Agent_Plugin_Updater {

    /**
     * Initialize hooks
     */
    public static function init() {
        // Hook into WordPress plugin update check
        add_filter('pre_set_site_transient_update_plugins', array(self::class, 'check_for_updates'));
        // Provide plugin info for the update details popup
        add_filter('plugins_api', array(self::class, 'plugin_info'), 20, 3);
    }

    /**
     * Check for updates from the EPOS Portal.
     * Called by WordPress when checking for plugin updates.
     *
     * @param object $transient The update_plugins transient.
     * @return object Modified transient with our update info.
     */
    public static function check_for_updates($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key)) {
            return $transient;
        }

        // Build list of installed company plugins using the activator helper
        $epos_plugins = Epos_Agent_Activator::get_epos_plugins();

        if (empty($epos_plugins)) {
            return $transient;
        }

        // Build installed_plugins payload
        $installed = array();
        $slug_to_file = array();

        foreach ($epos_plugins as $plugin) {
            $slug = $plugin['slug'];
            $installed[] = array(
                'slug' => $slug,
                'version' => $plugin['version'],
            );
            $slug_to_file[$slug] = $slug . '/' . $slug . '.php';
        }

        // Request updates from Portal
        $response = wp_remote_post(
            rtrim($portal_url, '/') . '/api/agent/plugin-updates',
            array(
                'timeout' => 30,
                'headers' => array(
                    'X-Agent-Key' => $api_key,
                    'X-Site-Url' => get_site_url(),
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ),
                'body' => wp_json_encode(array(
                    'installed_plugins' => $installed,
                )),
            )
        );

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $transient;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (empty($body['data']['updates'])) {
            return $transient;
        }

        // Add updates to transient
        foreach ($body['data']['updates'] as $update) {
            $slug = $update['slug'];
            if (!isset($slug_to_file[$slug])) {
                continue;
            }

            $plugin_file = $slug_to_file[$slug];

            $transient->response[$plugin_file] = (object) array(
                'slug' => $slug,
                'plugin' => $plugin_file,
                'new_version' => $update['new_version'],
                'url' => '',
                'package' => $update['download_url'],
                'icons' => array(),
                'banners' => array(),
                'requires' => '',
                'tested' => '',
                'requires_php' => '7.4',
            );
        }

        return $transient;
    }

    /**
     * Provide plugin information for the update details popup.
     *
     * @param false|object|array $result
     * @param string $action
     * @param object $args
     * @return false|object
     */
    public static function plugin_info($result, $action, $args) {
        if ($action !== 'plugin_information') {
            return $result;
        }

        // Only handle EPOS plugins
        if (empty($args->slug) || strpos($args->slug, 'epos-') !== 0) {
            return $result;
        }

        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (empty($portal_url) || empty($api_key)) {
            return $result;
        }

        // Request plugin info from Portal (send version 0.0.0 to force get latest)
        $response = wp_remote_post(
            rtrim($portal_url, '/') . '/api/agent/plugin-updates',
            array(
                'timeout' => 15,
                'headers' => array(
                    'X-Agent-Key' => $api_key,
                    'X-Site-Url' => get_site_url(),
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ),
                'body' => wp_json_encode(array(
                    'installed_plugins' => array(
                        array('slug' => $args->slug, 'version' => '0.0.0'),
                    ),
                )),
            )
        );

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $result;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (empty($body['data']['updates'])) {
            return $result;
        }

        $update = $body['data']['updates'][0];

        $info = (object) array(
            'name' => isset($update['name']) ? $update['name'] : $args->slug,
            'slug' => $args->slug,
            'version' => $update['new_version'],
            'author' => isset($update['author']) ? $update['author'] : 'EPOS Team',
            'homepage' => '',
            'requires' => '',
            'tested' => '',
            'requires_php' => '7.4',
            'downloaded' => 0,
            'last_updated' => isset($update['released_at']) ? $update['released_at'] : '',
            'sections' => array(
                'description' => isset($update['description']) ? $update['description'] : 'Company plugin managed by EPOS Portal.',
                'changelog' => !empty($update['changelog']) ? $update['changelog'] : 'No changelog available.',
            ),
            'download_link' => $update['download_url'],
        );

        return $info;
    }
}
