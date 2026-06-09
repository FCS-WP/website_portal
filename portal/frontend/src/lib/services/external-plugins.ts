import api from "@/lib/api";
import type {
  PluginUpdateRow,
  PluginSiteVersion,
  WpOrgSearchResult,
  WpOrgPluginInfo,
  SitePluginAll,
  ExternalPluginCacheStatus,
} from "@/types/external-plugins";

export const externalPluginService = {
  // Updates Dashboard
  getUpdates: (params?: { search?: string; filter?: string; sort?: string; page?: number; per_page?: number }) =>
    api.get<{
      data: PluginUpdateRow[];
      meta?: { pagination: { total: number; per_page: number; current_page: number; last_page: number } };
    }>("/plugins/external/updates", { params }),

  getUpdateSites: (slug: string) =>
    api.get<{ data: PluginSiteVersion[] }>(`/plugins/external/updates/${slug}/sites`),

  // WP.org Search
  search: (q: string, page: number = 1) =>
    api.get<{ data: WpOrgSearchResult[]; meta?: { page: number; pages: number; results: number } }>("/plugins/external/search", { params: { q, page } }),

  getPluginInfo: (slug: string) =>
    api.get<{ data: WpOrgPluginInfo }>(`/plugins/external/${slug}/info`),

  // Install
  install: (data: { slug: string; version: string; site_ids: number[]; activate?: boolean }) =>
    api.post("/plugins/external/install", data),

  // Bulk Update
  update: (data: { slug: string; site_ids: number[] | "all" }) =>
    api.post("/plugins/external/update", data),

  // Per-site plugins
  getSitePlugins: (siteId: number) =>
    api.get<{ data: SitePluginAll[] }>(`/sites/${siteId}/plugins/all`),

  activatePlugin: (siteId: number, data: { slug: string; plugin_file: string; plugin_name?: string }) =>
    api.post(`/sites/${siteId}/plugins/external/activate`, data),

  deactivatePlugin: (siteId: number, data: { slug: string; plugin_file: string; plugin_name?: string }) =>
    api.post(`/sites/${siteId}/plugins/external/deactivate`, data),

  uninstallPlugin: (siteId: number, data: { slug: string; plugin_file: string; confirmation: string }) =>
    api.post(`/sites/${siteId}/plugins/external/uninstall`, data),

  updateAllOnSite: (siteId: number) =>
    api.post(`/sites/${siteId}/plugins/external/update-all`),

  // Cache management
  refreshCache: () =>
    api.post("/plugins/external/refresh-cache"),

  getCacheStatus: () =>
    api.get<{ data: ExternalPluginCacheStatus }>("/plugins/external/cache-status"),
};
