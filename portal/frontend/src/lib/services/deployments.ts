import api from "@/lib/api";

export const deploymentsService = {
  create: (data: {
    plugin_version_id: number;
    site_ids?: number[];
    all_sites?: boolean;
    note?: string;
    scheduled_at?: string;
  }) => api.post("/deployments", data),

  list: (page = 1, perPage = 20) =>
    api.get("/deployments", { params: { page, per_page: perPage } }),

  show: (id: number) => api.get(`/deployments/${id}`),

  progress: (id: number) => api.get(`/deployments/${id}/progress`),

  retryFailed: (id: number) => api.post(`/deployments/${id}/retry-failed`),

  cancel: (id: number) => api.post(`/deployments/${id}/cancel`),

  rollbackSite: (deploymentJobSiteId: number | string) =>
    api.post(`/deployment-job-sites/${deploymentJobSiteId}/rollback`),

  scheduled: () => api.get("/deployments/scheduled"),

  updateSchedule: (jobId: number | string, scheduledAt: string) =>
    api.put(`/deployments/${jobId}/schedule`, { scheduled_at: scheduledAt }),

  cancelSchedule: (jobId: number | string) =>
    api.delete(`/deployments/${jobId}/schedule`),
};
