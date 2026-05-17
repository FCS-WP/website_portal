import api from "@/lib/api";

export const hostingService = {
  list: () => api.get("/hostings"),
  create: (data: { name: string; provider: string; note?: string; ip_address?: string; username?: string; password?: string; panel_url?: string }) =>
    api.post("/hostings", data),
  show: (id: number) => api.get(`/hostings/${id}`),
  update: (id: number, data: { name?: string; provider?: string; note?: string; ip_address?: string; username?: string; password?: string; panel_url?: string }) =>
    api.put(`/hostings/${id}`, data),
  delete: (id: number) => api.delete(`/hostings/${id}`),
  getCredentials: (id: number) => api.get(`/hostings/${id}/credentials`),
};
