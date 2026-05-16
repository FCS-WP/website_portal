import api from "@/lib/api";

export interface VaultLog {
  id: number;
  user: { id: number; name: string; email: string } | null;
  action: string;
  field_key: string | null;
  credential: { id: number; label: string } | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface VaultLogsResponse {
  data: VaultLog[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  };
}

export const vaultLogService = {
  list: (
    siteId: string | number,
    params?: {
      action?: string;
      from?: string;
      to?: string;
      page?: number;
      per_page?: number;
    }
  ) => api.get<VaultLogsResponse>(`/sites/${siteId}/vault-logs`, { params }),
};
