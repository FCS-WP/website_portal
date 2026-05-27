import api, { publicApi } from "@/lib/api";

export interface ShareLink {
  id: number;
  token: string;
  share_url: string;
  credential_type_ids: number[];
  credential_ids?: number[] | null;
  credential_types?: { id: number; name: string; slug: string }[];
  credentials?: { id: number; label: string; type: string; type_slug: string }[];
  expires_at: string;
  max_views: number;
  view_count: number;
  is_password_protected: boolean;
  last_accessed_at: string | null;
  last_accessed_ip: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by?: { id: number; name: string } | string;
  status: 'active' | 'expired' | 'exhausted' | 'revoked';
}

export interface ShareLinkCreateResponse {
  id: number;
  share_url: string;
  token: string;
  credential_ids?: number[] | null;
  expires_at: string;
  max_views: number;
  is_password_protected: boolean;
}

export interface ShareInfo {
  requires_password: boolean;
  site_name: string;
  credential_types: string[];
  credentials?: string[];
}

export interface ShareAccessResponse {
  site_name: string;
  credentials: {
    type: string;
    type_slug: string;
    label?: string;
    fields: { field_key?: string; field_label?: string; label: string; value: string }[];
  }[];
  views_remaining: number;
  expires_at: string;
}

export const credentialShareService = {
  create: (
    siteId: string | number,
    data: {
      credential_ids?: number[];
      credential_type_ids: number[];
      expires_hours: number;
      max_views: number;
      share_password?: string;
    }
  ) =>
    api.post<{ data: ShareLinkCreateResponse }>(
      `/sites/${siteId}/credentials/share`,
      data
    ),

  list: (siteId: string | number) =>
    api.get<{ data: ShareLink[] }>(`/sites/${siteId}/credentials/share-links`),

  revoke: (siteId: string | number, linkId: number) =>
    api.delete(`/sites/${siteId}/credentials/share-links/${linkId}`),

  // Public (no auth needed)
  getShareInfo: (token: string) =>
    publicApi.get<{ data: ShareInfo }>(`/vault/share/${token}`),

  accessShare: (token: string, password?: string) =>
    publicApi.post<{ data: ShareAccessResponse }>(
      `/vault/share/${token}/access`,
      { password }
    ),
};
