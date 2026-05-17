export interface SecurityOverview {
  total_sites: number;
  average_score: number;
  critical_alerts: number;
  high_alerts: number;
  unresolved_vulnerabilities: number;
  sites_without_2fa: number;
  recent_alerts: SecurityAlert[];
  score_distribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}

export interface SecurityAlert {
  id: number;
  site_id: number;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string | null;
  detail: Record<string, any> | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  resolved_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  site?: {
    id: number;
    name: string;
    url: string;
  };
}

export interface SiteVulnerability {
  id: number;
  site_id: number;
  vulnerability_definition_id: number;
  plugin_slug: string;
  installed_version: string;
  status: 'active' | 'patched' | 'ignored';
  patched_at: string | null;
  detected_at: string;
  vulnerability_definition?: VulnerabilityDefinition;
  site?: {
    id: number;
    name: string;
  };
}

export interface VulnerabilityDefinition {
  id: number;
  source_id: string;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss_score: number | null;
  affected_plugin: string;
  affected_versions: string;
  patched_version: string | null;
  references: string[] | null;
  published_at: string;
  site_vulnerabilities_count?: number;
}

export interface FileIntegrityFinding {
  id: number;
  site_id: number;
  file_path: string;
  change_type: 'modified' | 'added' | 'removed';
  severity: 'critical' | 'high' | 'medium' | 'low';
  expected_hash: string | null;
  actual_hash: string | null;
  file_size: number | null;
  status: 'unresolved' | 'resolved' | 'whitelisted';
  detected_at: string;
  resolved_at: string | null;
}

export interface LoginEvent {
  id: number;
  site_id: number;
  username: string;
  ip_address: string;
  status: 'success' | 'failed';
  user_agent: string | null;
  attempted_at: string;
}

export interface SiteAdminUser {
  id: number;
  site_id: number;
  wp_user_id: number;
  username: string;
  email: string;
  role: string;
  has_2fa: boolean;
  last_login_at: string | null;
  created_at_wp: string | null;
}

export interface Site2faSetting {
  id: number;
  site_id: number;
  is_enabled: boolean;
  provider: string | null;
  enforced_roles: string[] | null;
  enabled_at: string | null;
}

export interface SiteSecurityScore {
  id: number;
  site_id: number;
  overall_score: number;
  breakdown: {
    file_integrity: number;
    vulnerabilities: number;
    login_security: number;
    user_security: number;
    two_fa: number;
    maintenance: number;
  };
  calculated_at: string;
  site?: {
    id: number;
    name: string;
    url: string;
  };
}

export interface SecurityScanRun {
  id: number;
  site_id: number;
  scan_type: string;
  status: 'running' | 'completed' | 'failed';
  findings_count: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface TwofaDashboard {
  total_sites: number;
  sites_with_2fa: number;
  sites_without_2fa: number;
  sites_list: Array<{
    id: number;
    name: string;
    url: string;
    is_enabled: boolean;
    provider: string | null;
  }>;
}

export interface SiteSecurityDetail {
  score: SiteSecurityScore | null;
  recent_alerts: SecurityAlert[];
  active_vulnerabilities: SiteVulnerability[];
  file_findings: FileIntegrityFinding[];
  admin_users: SiteAdminUser[];
  two_fa_status: Site2faSetting | null;
  recent_logins: LoginEvent[];
  scan_runs: SecurityScanRun[];
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
