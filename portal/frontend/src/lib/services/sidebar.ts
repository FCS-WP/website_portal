import api from "@/lib/api";

export interface SidebarCounts {
  sites: number;
  hostings: number;
  plugin_updates: number;
  plugins: number;
  security_alerts: number;
  active_deployments: number;
}

export const sidebarService = {
  counts: () => api.get<{ data: SidebarCounts }>("/sidebar/counts"),
};
