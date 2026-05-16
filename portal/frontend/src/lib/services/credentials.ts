import api from "@/lib/api";
import { Credential, CredentialType } from "@/types";

export const credentialService = {
  list: (siteId: number | string) =>
    api.get<{ data: Credential[] }>(`/sites/${siteId}/credentials`),

  get: (siteId: number | string, credentialId: number) =>
    api.get<{ data: Credential }>(`/sites/${siteId}/credentials/${credentialId}`),

  create: (siteId: number | string, data: Record<string, unknown>) =>
    api.post<{ data: Credential }>(`/sites/${siteId}/credentials`, data),

  update: (siteId: number | string, credentialId: number, data: Record<string, unknown>) =>
    api.put<{ data: Credential }>(`/sites/${siteId}/credentials/${credentialId}`, data),

  delete: (siteId: number | string, credentialId: number, vault_pin: string) =>
    api.delete(`/sites/${siteId}/credentials/${credentialId}`, { data: { vault_pin } }),

  reveal: (siteId: number | string, credentialId: number, field_key: string, vault_pin: string) =>
    api.post<{ value: string; expires_in: number }>(
      `/sites/${siteId}/credentials/${credentialId}/reveal`,
      { field_key, vault_pin }
    ),

  copy: (siteId: number | string, credentialId: number, field_key: string, vault_pin: string) =>
    api.post<{ value: string }>(
      `/sites/${siteId}/credentials/${credentialId}/copy`,
      { field_key, vault_pin }
    ),

  autologin: (siteId: number | string) =>
    api.post<{ data: { redirect_url: string } }>(`/sites/${siteId}/autologin`),

  getTypes: () =>
    api.get<{ data: CredentialType[] }>("/credential-types"),
};
