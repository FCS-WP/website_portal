=== EPOS WP Agent ===
Contributors: eposteam
Tags: management, central control, portal, agent
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Communication bridge between this WordPress site and the EPOS Central Control Portal.

== Description ==

EPOS WP Agent connects your WordPress site to the EPOS Central Control Portal, enabling:

* Centralized plugin management and deployment
* WooCommerce order monitoring
* SMTP configuration management
* Site health monitoring via heartbeat pings

== Installation ==

1. Upload the `epos-wp-agent` folder to the `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to Settings > EPOS Agent
4. Enter your Portal URL and API Secret Key (obtained from the Portal when registering your site)
5. Click "Test Connection" to verify

== Changelog ==

= 1.0.0 =
* Initial release
* Handshake and ping communication with Portal
* Plugin install/update via Portal commands
* SMTP configuration management
* WooCommerce order sync
* WordPress REST API endpoints for Portal commands
