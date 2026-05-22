import api from "@/lib/api";

export type SmtpEncryption = "tls" | "ssl" | "none";

export interface PortalSmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password_set: boolean;
  encryption: SmtpEncryption;
  from_email: string;
  from_name: string;
}

export interface SiteSmtpConfig extends Omit<PortalSmtpConfig, "enabled"> {
  configured: boolean;
  enabled: boolean;
  last_pushed_at: string | null;
}

export interface SmtpFormPayload {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  // Empty string means "don't change". A real value writes (and encrypts) it.
  password: string;
  encryption: SmtpEncryption;
  from_email: string;
  from_name: string;
}

export const smtpService = {
  // Portal-wide
  getPortal: () => api.get<{ data: PortalSmtpConfig }>("/smtp/portal"),
  updatePortal: (data: SmtpFormPayload) => api.put("/smtp/portal", data),
  testPortal: (toEmail: string) =>
    api.post("/smtp/portal/test", { to_email: toEmail }),
  applyPortalToSites: (overwrite: boolean) =>
    api.post<{
      data: {
        created: number;
        overwritten: number;
        skipped_existing: number;
        no_api_key: number;
      };
      message: string;
    }>("/smtp/portal/apply-to-sites", { overwrite }),

  // Per-site
  getSite: (siteId: number) =>
    api.get<{ data: SiteSmtpConfig }>(`/sites/${siteId}/smtp`),
  updateSite: (siteId: number, data: SmtpFormPayload) =>
    api.put(`/sites/${siteId}/smtp`, data),
  testSite: (siteId: number, toEmail: string) =>
    api.post(`/sites/${siteId}/smtp/test`, { to_email: toEmail }),
};
