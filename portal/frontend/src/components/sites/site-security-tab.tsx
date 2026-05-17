'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  AlertTriangle,
  Lock,
  Users,
  FileWarning,
  RefreshCw,
  Loader2,
  Check,
  X,
  LogIn,
  ScanSearch,
  Database,
} from 'lucide-react';
import { securityService } from '@/lib/services/security';
import type { SiteSecurityDetail } from '@/types/security';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SiteSecurityTabProps {
  siteId: number;
}

function getScoreColor(score: number) {
  if (score >= 90) return { ring: 'text-green-500', bg: 'stroke-green-500' };
  if (score >= 70) return { ring: 'text-blue-500', bg: 'stroke-blue-500' };
  if (score >= 50) return { ring: 'text-yellow-500', bg: 'stroke-yellow-500' };
  return { ring: 'text-red-500', bg: 'stroke-red-500' };
}

function getSeverityClasses(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 hover:bg-red-100';
    case 'high':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-100';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
    case 'low':
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
}

function getChangeTypeBadge(changeType: string) {
  switch (changeType) {
    case 'modified':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
    case 'added':
      return 'bg-green-100 text-green-800 hover:bg-green-100';
    case 'removed':
      return 'bg-red-100 text-red-800 hover:bg-red-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
}

const BREAKDOWN_LABELS: Record<string, string> = {
  file_integrity: 'File Integrity',
  vulnerabilities: 'Vulnerabilities',
  login_security: 'Login Security',
  user_security: 'User Security',
  two_fa: '2FA',
  maintenance: 'Maintenance',
};

export function SiteSecurityTab({ siteId }: SiteSecurityTabProps) {
  const [data, setData] = useState<SiteSecurityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [creatingBaseline, setCreatingBaseline] = useState(false);
  const [toggling2fa, setToggling2fa] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      const res = await securityService.siteDetail(siteId);
      setData(res.data.data);
    } catch {
      setError(true);
      toast.error('Failed to load security data');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (siteId) fetchData();
  }, [siteId, fetchData]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await securityService.recalculateScore(siteId);
      toast.success('Score recalculated');
      await fetchData();
    } catch {
      toast.error('Failed to recalculate score');
    } finally {
      setRecalculating(false);
    }
  };

  const handleScanFiles = async () => {
    setScanning(true);
    try {
      await securityService.triggerFileScan(siteId);
      toast.success('File scan initiated');
      await fetchData();
    } catch {
      toast.error('Failed to start file scan');
    } finally {
      setScanning(false);
    }
  };

  const handleCreateBaseline = async () => {
    setCreatingBaseline(true);
    try {
      await securityService.triggerBaselineCreate(siteId);
      toast.success('Baseline created');
      await fetchData();
    } catch {
      toast.error('Failed to create baseline');
    } finally {
      setCreatingBaseline(false);
    }
  };

  const handleToggle2fa = async () => {
    if (!data) return;
    setToggling2fa(true);
    try {
      if (data.two_fa_status?.is_enabled) {
        await securityService.disable2fa(siteId);
        toast.success('2FA disabled');
      } else {
        await securityService.enable2fa(siteId, 'totp');
        toast.success('2FA enabled');
      }
      await fetchData();
    } catch {
      toast.error('Failed to update 2FA status');
    } finally {
      setToggling2fa(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">Failed to load security data.</p>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const score = data.score;
  const overallScore = score?.overall_score ?? 0;
  const colors = getScoreColor(overallScore);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  const unresolvedFindings = data.file_findings.filter(f => f.status === 'unresolved');
  const activeVulnerabilities = data.active_vulnerabilities;
  const hasBaseline = data.scan_runs.some(r => r.scan_type === 'baseline' && r.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Score Ring */}
            <div className="relative flex-shrink-0">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/20"
                />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  className={colors.bg}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-3xl font-bold ${colors.ring}`}>{overallScore}</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex-1 w-full space-y-2">
              {score?.breakdown && Object.entries(score.breakdown).map(([key, deduction]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm w-32 text-muted-foreground">{BREAKDOWN_LABELS[key] || key}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${deduction === 0 ? 'bg-green-500' : deduction <= 5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(100 - deduction * 5, 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {deduction === 0 ? 'OK' : `-${deduction}`}
                  </span>
                </div>
              ))}
              {!score && <p className="text-sm text-muted-foreground">No score calculated yet.</p>}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Recalculate Score
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File Integrity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              File Integrity
              {unresolvedFindings.length > 0 && (
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 ml-2">
                  {unresolvedFindings.length} unresolved
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              {!hasBaseline && (
                <Button variant="outline" size="sm" onClick={handleCreateBaseline} disabled={creatingBaseline}>
                  {creatingBaseline ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                  Create Baseline
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleScanFiles} disabled={scanning}>
                {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
                Scan Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {unresolvedFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unresolved file integrity findings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">File Path</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Change</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Severity</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedFindings.slice(0, 5).map((finding) => (
                    <tr key={finding.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs max-w-[200px] truncate">{finding.file_path}</td>
                      <td className="py-2 pr-4">
                        <Badge className={getChangeTypeBadge(finding.change_type)}>{finding.change_type}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={getSeverityClasses(finding.severity)}>{finding.severity}</Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">{format(new Date(finding.detected_at), 'MMM d, HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unresolvedFindings.length > 5 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing 5 of {unresolvedFindings.length} findings.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vulnerabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Vulnerabilities
            {activeVulnerabilities.length > 0 && (
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 ml-2">
                {activeVulnerabilities.length} active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeVulnerabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active vulnerabilities found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Plugin</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Severity</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Installed</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Patched</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVulnerabilities.map((vuln) => (
                    <tr key={vuln.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{vuln.plugin_slug}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate">
                        {vuln.vulnerability_definition?.title || '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={getSeverityClasses(vuln.vulnerability_definition?.severity || 'low')}>
                          {vuln.vulnerability_definition?.severity || 'unknown'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{vuln.installed_version}</td>
                      <td className="py-2 font-mono text-xs">
                        {vuln.vulnerability_definition?.patched_version || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Login Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Login Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_logins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent login events.</p>
          ) : (
            <>
              <div className="flex gap-4 mb-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">{data.recent_logins.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Failed: </span>
                  <span className="font-medium text-red-600">
                    {data.recent_logins.filter(l => l.status === 'failed').length}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Username</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">IP Address</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_logins.slice(0, 10).map((event) => (
                      <tr key={event.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{event.username}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{event.ip_address}</td>
                        <td className="py-2 pr-4">
                          <Badge className={event.status === 'success' ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-red-100 text-red-800 hover:bg-red-100'}>
                            {event.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">{format(new Date(event.attempted_at), 'MMM d, HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Admin Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Admin Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.admin_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Username</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Role</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">2FA</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {data.admin_users.map((user) => (
                    <tr key={user.id} className={`border-b last:border-0 ${!user.has_2fa ? 'bg-amber-50' : ''}`}>
                      <td className="py-2 pr-4 font-medium">{user.username}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{user.email}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary">{user.role}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {user.has_2fa ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {user.last_login_at ? format(new Date(user.last_login_at), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2FA Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge className={data.two_fa_status?.is_enabled ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-red-100 text-red-800 hover:bg-red-100'}>
                  {data.two_fa_status?.is_enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              {data.two_fa_status?.provider && (
                <p className="text-sm text-muted-foreground">
                  Provider: <span className="font-medium">{data.two_fa_status.provider}</span>
                </p>
              )}
              {data.two_fa_status?.enforced_roles && data.two_fa_status.enforced_roles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Enforced for: {data.two_fa_status.enforced_roles.join(', ')}
                </p>
              )}
            </div>
            <Button
              variant={data.two_fa_status?.is_enabled ? 'destructive' : 'default'}
              size="sm"
              onClick={handleToggle2fa}
              disabled={toggling2fa}
            >
              {toggling2fa && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {data.two_fa_status?.is_enabled ? 'Disable 2FA' : 'Enable 2FA'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
