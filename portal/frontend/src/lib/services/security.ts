import api from "@/lib/api";
import type {
  SecurityOverview,
  SecurityAlert,
  SiteVulnerability,
  VulnerabilityDefinition,
  FileIntegrityFinding,
  LoginEvent,
  SiteAdminUser,
  Site2faSetting,
  SiteSecurityScore,
  TwofaDashboard,
  SiteSecurityDetail,
  PaginatedResponse,
} from "@/types/security";

export const securityService = {
  // Overview
  overview: () =>
    api.get<{ data: SecurityOverview }>("/security/overview"),

  // Alerts
  alerts: (params?: {
    severity?: string;
    status?: string;
    site_id?: number;
    type?: string;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<SecurityAlert>>("/security/alerts", { params }),

  updateAlert: (alertId: number, data: { status: string }) =>
    api.patch<{ data: SecurityAlert }>(`/security/alerts/${alertId}`, data),

  // Vulnerabilities
  vulnerabilities: (params?: {
    severity?: string;
    status?: string;
    site_id?: number;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<SiteVulnerability>>("/security/vulnerabilities", { params }),

  vulnerabilityDefinitions: (params?: {
    severity?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<VulnerabilityDefinition>>("/security/vulnerability-definitions", { params }),

  // Scores
  scores: (params?: {
    sort?: string;
    direction?: "asc" | "desc";
    below?: number;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<SiteSecurityScore>>("/security/scores", { params }),

  // Site-specific
  siteDetail: (siteId: number) =>
    api.get<{ data: SiteSecurityDetail }>(`/security/sites/${siteId}`),

  siteFileFindings: (siteId: number, params?: {
    status?: string;
    severity?: string;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<FileIntegrityFinding>>(`/security/sites/${siteId}/file-findings`, { params }),

  siteLoginEvents: (siteId: number, params?: {
    status?: string;
    ip?: string;
    username?: string;
    page?: number;
    per_page?: number;
  }) =>
    api.get<PaginatedResponse<LoginEvent>>(`/security/sites/${siteId}/login-events`, { params }),

  siteAdminUsers: (siteId: number) =>
    api.get<{ data: SiteAdminUser[] }>(`/security/sites/${siteId}/admin-users`),

  site2faStatus: (siteId: number) =>
    api.get<{ data: Site2faSetting | null }>(`/security/sites/${siteId}/2fa`),

  // 2FA Dashboard
  twofaDashboard: () =>
    api.get<{ data: TwofaDashboard }>("/security/2fa-dashboard"),

  enable2fa: (siteId: number, method: string) =>
    api.post(`/security/sites/${siteId}/2fa/enable`, { method }),

  disable2fa: (siteId: number) =>
    api.post(`/security/sites/${siteId}/2fa/disable`),

  // Actions
  triggerFileScan: (siteId: number) =>
    api.post(`/security/sites/${siteId}/scan/files`),

  triggerBaselineCreate: (siteId: number) =>
    api.post(`/security/sites/${siteId}/baseline/create`),

  recalculateScore: (siteId: number) =>
    api.post<{ data: SiteSecurityScore }>(`/security/sites/${siteId}/score/recalculate`),
};
