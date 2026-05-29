import api from "@/lib/api";
import type {
  ApiResponse,
  FailedJob,
  FailedJobDetail,
  QueueStats,
} from "@/types";

export interface ListFailedJobsParams {
  page?: number;
  per_page?: number;
  queue?: string;
  date_range?: string;
}

export const queueService = {
  listFailedJobs: (params: ListFailedJobsParams = {}) =>
    api.get<ApiResponse<FailedJob[]>>("/queue/failed-jobs", { params }),

  getFailedJob: (uuid: string) =>
    api.get<ApiResponse<FailedJobDetail>>(`/queue/failed-jobs/${uuid}`),

  retryJob: (uuid: string) =>
    api.post<ApiResponse<{ uuid: string }>>(`/queue/failed-jobs/${uuid}/retry`),

  deleteJob: (uuid: string) =>
    api.delete<ApiResponse<{ uuid: string }>>(`/queue/failed-jobs/${uuid}`),

  retryAll: () =>
    api.post<ApiResponse<{ retried: number }>>("/queue/failed-jobs/retry-all"),

  flushAll: () =>
    api.delete<ApiResponse<{ deleted: number }>>("/queue/failed-jobs/flush"),

  getStats: () => api.get<ApiResponse<QueueStats>>("/queue/stats"),
};
