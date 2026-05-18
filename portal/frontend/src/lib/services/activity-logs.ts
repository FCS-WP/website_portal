import api from "@/lib/api";

export interface ActivityLogParams {
  action?: string;
  user_id?: number;
  site_id?: number;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export const activityLogService = {
  list: (params: ActivityLogParams = {}) =>
    api.get("/activity-logs", { params }),
  filterOptions: () => api.get("/activity-logs/filter-options"),
};
