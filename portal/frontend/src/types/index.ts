export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "dev" | "mkt";
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hosting {
  id: number;
  name: string;
  provider: string;
  note: string | null;
  sites_count?: number;
  created_at: string;
  updated_at: string;
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
  plugin_version_id: number;
  initiated_by: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_sites: number;
  success_count: number;
  failed_count: number;
  note: string | null;
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
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  error_message: string | null;
  attempt_count: number;
  deployed_at: string | null;
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
