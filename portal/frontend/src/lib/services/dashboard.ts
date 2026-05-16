import api from "@/lib/api";

export interface DashboardStats {
  total_sites: number;
  online_sites: number;
  offline_sites: number;
  sites_this_month: number;
  plugin_updates_pending: number;
  sites_with_updates: number;
  recent_sites: RecentSite[];
  recent_activity: RecentActivity[];
}

export interface RecentSite {
  id: number;
  name: string;
  url: string;
  status: "pending" | "connected" | "disconnected";
  hosting_name: string;
  last_seen_at: string | null;
}

export interface RecentActivity {
  id: number;
  action: string;
  subject_type: string;
  subject_id: number;
  description: string;
  user_name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export const dashboardService = {
  stats: () => api.get<{ success: boolean; data: DashboardStats }>("/dashboard/stats"),
};
