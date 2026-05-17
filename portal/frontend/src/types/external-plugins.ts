// Plugin Updates Dashboard types
export interface PluginUpdatesSummary {
  plugins_with_updates: number;
  sites_with_outdated: number;
  total_outdated_instances: number;
}

export interface PluginUpdateRow {
  slug: string;
  name: string;
  rating: number | null;
  active_installs: string | null;
  last_updated_wporg: string | null;
  is_abandoned: boolean;
  latest_version: string | null;
  installed_on_sites: number;
  needs_update_count: number;
  version_breakdown: VersionBreakdown[];
}

export interface VersionBreakdown {
  version: string;
  site_count: number;
}

export interface PluginUpdatesResponse {
  stats: PluginUpdatesSummary;
  plugins: PluginUpdateRow[];
}

// Sites with specific plugin
export interface PluginSiteVersion {
  site_id: number;
  site_name: string;
  site_url: string;
  installed_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  is_active: boolean;
  plugin_file: string | null;
}

// WP.org Search types
export interface WpOrgSearchResult {
  slug: string;
  name: string;
  short_description: string;
  author: string;
  rating: number;
  num_ratings: number;
  active_installs: number;
  last_updated: string;
  version: string;
  download_link: string;
  requires: string | null;
  tested: string | null;
  is_abandoned: boolean;
  already_installed_count: number;
}

export interface WpOrgSearchResponse {
  results: WpOrgSearchResult[];
  total: number;
  page: number;
  pages: number;
}

// Plugin info (detailed)
export interface WpOrgPluginInfo {
  slug: string;
  name: string;
  author: string;
  latest_version: string;
  download_url: string;
  requires_wp: string | null;
  tested_up_to: string | null;
  rating: number | null;
  active_installs: string | null;
  last_updated_wporg: string | null;
  is_on_wporg: boolean;
  is_abandoned: boolean;
}

// Per-site plugin (unified for all 3 types)
export interface SitePluginAll {
  id: number;
  site_id: number;
  plugin_id: number | null;
  plugin_slug: string;
  plugin_name: string | null;
  plugin_file: string | null;
  plugin_type: 'internal' | 'wporg' | 'premium';
  installed_version: string | null;
  latest_version: string | null;
  is_active: boolean;
  update_available: boolean;
  last_synced_at: string | null;
  external_plugin?: {
    slug: string;
    name: string;
    rating: number | null;
    active_installs: string | null;
    is_abandoned: boolean;
    last_updated_wporg: string | null;
  } | null;
}

// Operation log
export interface PluginOperationLog {
  id: number;
  site_id: number;
  plugin_slug: string;
  plugin_name: string | null;
  operation: 'activate' | 'deactivate';
  status: 'success' | 'failed';
  error_message: string | null;
  performed_by: number | null;
  performed_at: string;
}

// Cache status
export interface ExternalPluginCacheStatus {
  total_slugs_cached: number;
  wporg_count: number;
  not_on_wporg_count: number;
  abandoned_count: number;
  last_synced_at: string | null;
}
