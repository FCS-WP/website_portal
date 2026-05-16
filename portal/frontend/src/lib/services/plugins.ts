import api from "@/lib/api";

export const pluginService = {
  list: () => api.get("/plugins"),
  create: (data: { name: string; description?: string; author?: string }) =>
    api.post("/plugins", data),
  show: (id: number) => api.get(`/plugins/${id}`),
  update: (id: number, data: Record<string, unknown>) =>
    api.put(`/plugins/${id}`, data),
  versions: (id: number) => api.get(`/plugins/${id}/versions`),
  uploadVersion: (
    pluginId: number,
    formData: FormData,
    onProgress?: (percent: number) => void
  ) =>
    api.post(`/plugins/${pluginId}/versions`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    }),
  getDownloadUrl: (versionId: number) =>
    api.get(`/plugin-versions/${versionId}/download-url`),
  deleteVersion: (versionId: number) =>
    api.delete(`/plugin-versions/${versionId}`),
  promoteVersion: (versionId: number | string) =>
    api.post(`/plugin-versions/${versionId}/promote`),
  betaStatus: (versionId: number | string) =>
    api.get(`/plugin-versions/${versionId}/beta-status`),
};
