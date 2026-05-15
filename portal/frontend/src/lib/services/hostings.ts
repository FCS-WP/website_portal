import api from "@/lib/api";

export const hostingService = {
  list: () => api.get("/hostings"),
  create: (data: { name: string; provider: string; note?: string }) =>
    api.post("/hostings", data),
  show: (id: number) => api.get(`/hostings/${id}`),
  update: (id: number, data: { name?: string; provider?: string; note?: string }) =>
    api.put(`/hostings/${id}`, data),
  delete: (id: number) => api.delete(`/hostings/${id}`),
};
