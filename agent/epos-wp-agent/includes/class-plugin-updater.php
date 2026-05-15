<?php
/**
 * Overrides WordPress update checks for EPOS company plugins.
 * Allows the Portal to serve as the update source for company plugins.
 */
class Epos_Agent_Plugin_Updater {

    public static function init() {
        add_filter('pre_set_site_transient_update_plugins', [self::class, 'check_for_updates']);
        add_filter('plugins_api', [self::class, 'plugin_info'], 10, 3);
    }

    /**
     * Check Portal for updates to EPOS plugins
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

        // Get currently installed EPOS plugins
        $epos_plugins = Epos_Agent_Activator::get_epos_plugins();

        foreach ($epos_plugins as $plugin) {
            $slug = $plugin['slug'];
            $current_version = $plugin['version'];
            $plugin_file = $slug . '/' . $slug . '.php';

            // TODO: In Phase 2, implement API call to Portal to check latest version
            // For now, this is a stub that will be completed when the plugin
            // deployment system is fully implemented.
            // 
            // The Portal will expose: GET /api/agent/plugin-updates
            // which returns latest versions for all company plugins.
        }

        return $transient;
    }

    /**
     * Return plugin info from Portal for EPOS plugins
     */
    public static function plugin_info($result, $action, $args) {
        if ($action !== 'plugin_information') {
            return $result;
        }

        // Only handle EPOS plugins
        if (empty($args->slug) || strpos($args->slug, 'epos-') !== 0) {
            return $result;
        }

        // TODO: In Phase 2, fetch plugin info from Portal
        // GET /api/agent/plugin-info?slug={slug}

        return $result;
    }
}
