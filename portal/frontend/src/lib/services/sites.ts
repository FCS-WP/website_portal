import api from "@/lib/api";

export const siteService = {
  list: (params?: Record<string, unknown>) => api.get("/sites", { params }),
  create: (data: Record<string, unknown>) => api.post("/sites", data),
  show: (id: number) => api.get(`/sites/${id}`),
  update: (id: number, data: Record<string, unknown>) =>
    api.put(`/sites/${id}`, data),
  delete: (id: number) => api.delete(`/sites/${id}`),
  restore: (id: number) => api.post(`/sites/${id}/restore`),
  regenerateKey: (id: number) => api.post(`/sites/${id}/regenerate-key`),
  activity: (id: number, params?: Record<string, unknown>) =>
    api.get(`/sites/${id}/activity`, { params }),
  plugins: (id: number) => api.get(`/sites/${id}/plugins`),
  autologin: (id: number | string) => api.post(`/sites/${id}/autologin`),
  toggleBetaTester: (siteId: number | string) => api.post(`/sites/${siteId}/toggle-beta`),
};
