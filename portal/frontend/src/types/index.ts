export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "dev" | "mkt";
  telegram_chat_id: string | null;
  is_active: boolean;
  has_vault_pin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hosting {
  id: number;
  name: string;
  provider: string;
  note: string | null;
  ip_address: string | null;
  username: string | null;
  panel_url: string | null;
  has_credentials: boolean;
  sites_count?: number;
  created_at: string;
  updated_at: string;
}

export interface HostingCredentials {
  username: string | null;
  password: string | null;
  ip_address: string | null;
  panel_url: string | null;
}

export interface Site {
  id: number;
  hosting_id: number | null;
  name: string;
  url: string;
  description: string | null;
  status: "pending" | "connected" | "disconnected";
  wp_version: string | null;
  php_version: string | null;
  woo_active: boolean;
  is_beta_tester?: boolean;
  last_ping_at: string | null;
  tags: string[] | null;
  hosting?: Hosting;
  users?: User[];
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    pagination?: {
      total: number;
      per_page: number;
      current_page: number;
      last_page: number;
    };
  };
}

export interface ApiError {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

export interface Plugin {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  author: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  latest_version?: PluginVersion | null;
  site_plugins_count?: number;
}

export interface PluginVersion {
  id: number;
  plugin_id: number;
  version: string;
  file_path: string;
  file_size: number;
  file_hash: string;
  is_stable: boolean;
  track?: 'beta' | 'stable';
  released_by: number;
  released_at: string;
  created_at: string;
  updated_at: string;
  changelog?: PluginChangelog | null;
  released_by_user?: { id: number; name: string };
}

export interface PluginChangelog {
  id: number;
  plugin_version_id: number;
  content: string;
  type: 'feature' | 'bugfix' | 'security' | 'breaking' | 'other';
  created_at: string;
}

export interface DeploymentJob {
  id: number;
  plugin_version_id: number | null;
  initiated_by: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'scheduled';
  job_type?: 'deploy' | 'rollback' | 'wporg_install' | 'wporg_update' | 'wporg_uninstall';
  plugin_slug?: string | null;
  plugin_name?: string | null;
  target_version?: string | null;
  total_sites: number;
  success_count: number;
  failed_count: number;
  note: string | null;
  scheduled_at?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  plugin_version?: PluginVersion & { plugin?: Plugin };
  initiator?: { id: number; name: string };
  sites?: DeploymentJobSite[];
}

export interface DeploymentJobSite {
  id: number;
  deployment_job_id: number;
  site_id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'healthy' | 'rolled_back';
  error_message: string | null;
  attempt_count: number;
  deployed_at: string | null;
  rollback_version?: string | null;
  rollback_reason?: string | null;
  health_check_results?: Record<string, boolean | null> | null;
  rolled_back_at?: string | null;
  site?: { id: number; name: string; url: string; status: string; hosting_id?: number; hosting?: { id: number; name: string } };
}

export interface DeploymentProgress {
  job_status: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  running: number;
  skipped: number;
  healthy: number;
  rolled_back: number;
}

export interface BetaStatus {
  total_beta_sites: number;
  deployed: number;
  healthy: number;
  failed: number;
  rolled_back: number;
  days_running: number;
  status_message: string;
}

export interface SitePlugin {
  id: number;
  plugin: {
    id: number;
    name: string;
    slug: string;
    author: string | null;
  };
  installed_version: string | null;
  latest_version: string | null;
  is_active: boolean;
  is_outdated: boolean;
  last_synced_at: string | null;
}

export interface ActivityLog {
  id: number;
  action: string;
  subject_type: string;
  subject_id: number;
  user_id: number;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: { id: number; name: string };
}

export interface CredentialField {
  id: number;
  field_key: string;
  field_label: string;
  field_value: string | null;
  is_sensitive: boolean;
  sort_order: number;
}

export interface Credential {
  id: number;
  credential_type: {
    id: number;
    name: string;
    slug: string;
    icon: string;
  };
  label: string;
  fields: CredentialField[];
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialType {
  id: number;
  name: string;
  slug: string;
  icon: string;
  sort_order: number;
}

// ─── Phase 7 — Orders ──────────────────────────────────────────────
export type OrderStatus =
  | "pending"
  | "processing"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed"
  | string;

export interface OrderLineItem {
  name: string;
  qty: number;
  total: string;
}

export interface OrderSummary {
  id: number;
  site_id: number;
  site_name: string | null;
  site_url: string | null;
  woo_order_id: number;
  order_number: string | null;
  status: OrderStatus;
  total: string;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  payment_method: string | null;
  payment_method_title: string | null;
  items_count: number;
  order_date: string | null;
  synced_at: string | null;
  wp_admin_edit_url: string | null;
}

export interface Order extends OrderSummary {
  customer_phone: string | null;
  billing_address: string | null;
  line_items: OrderLineItem[] | null;
  latest_note: string | null;
}

export interface OrderListMeta {
  total: number;
  page: number;
  per_page: number;
  last_page: number;
  last_synced_at: string | null;
}

export interface MostActiveSite {
  site_id: number;
  site_name: string | null;
  site_url: string | null;
  order_count_today: number;
}

export interface OrderFilterOptions {
  sites: { id: number; name: string }[];
  statuses: string[];
  payment_methods: { slug: string; title: string }[];
}

export interface OrderSiteStats {
  orders_today: number;
  processing_now: number;
  last_order_at: string | null;
}

export interface OrderSearchFallback {
  site_id: number;
  site_name: string;
  url: string;
}
