"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import {
  ArrowLeft,
  Upload,
  Download,
  Check,
  X,
  Pencil,
  FileText,
  Rocket,
  ArrowUpCircle,
  FlaskConical,
} from "lucide-react";
import { pluginService } from "@/lib/services/plugins";
import { Plugin, PluginVersion, BetaStatus } from "@/types";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { DeployDialog } from "@/components/plugins/deploy-dialog";

const changelogTypeColors: Record<string, string> = {
  feature: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  bugfix: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  security: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  breaking: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

export default function PluginDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [changelogDialogOpen, setChangelogDialogOpen] = useState(false);
  const [selectedChangelog, setSelectedChangelog] = useState<PluginVersion | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    author: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVersion, setUploadVersion] = useState("");
  const [uploadChangelog, setUploadChangelog] = useState("");
  const [uploadType, setUploadType] = useState<string>("feature");
  const [uploadTrack, setUploadTrack] = useState<'stable' | 'beta'>('stable');
  const [uploadIsStable, setUploadIsStable] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Deploy dialog state
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployVersion, setDeployVersion] = useState<PluginVersion | null>(null);

  // Promote dialog state
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteVersion, setPromoteVersion] = useState<PluginVersion | null>(null);
  const [promoting, setPromoting] = useState(false);

  // Beta status state
  const [betaStatusMap, setBetaStatusMap] = useState<Record<number, BetaStatus>>({});
  const [expandedBetaVersion, setExpandedBetaVersion] = useState<number | null>(null);

  const fetchPlugin = useCallback(async () => {
    try {
      const res = await pluginService.show(id);
      setPlugin(res.data.data);
    } catch {
      toast.error("Failed to load plugin details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await pluginService.versions(id);
      setVersions(res.data.data || []);
    } catch {
      toast.error("Failed to load versions");
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchPlugin();
      fetchVersions();
    }
  }, [id, fetchPlugin, fetchVersions]);

  const handleEdit = async () => {
    setEditSubmitting(true);
    try {
      await pluginService.update(id, {
        name: editForm.name,
        description: editForm.description || null,
        author: editForm.author || null,
      });
      toast.success("Plugin updated successfully");
      setEditDialogOpen(false);
      fetchPlugin();
    } catch {
      toast.error("Failed to update plugin");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadVersion || !uploadChangelog.trim()) {
      toast.error("Please provide a file, version number, and changelog");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("version", uploadVersion);
      formData.append("changelog", uploadChangelog);
      formData.append("type", uploadType);
      formData.append("track", uploadTrack);
      formData.append("is_stable", uploadTrack === 'stable' && uploadIsStable ? "1" : "0");

      await pluginService.uploadVersion(id, formData, (percent) => {
        setUploadProgress(percent);
      });

      toast.success("Version uploaded successfully");
      setUploadFile(null);
      setUploadVersion("");
      setUploadChangelog("");
      setUploadType("feature");
      setUploadTrack('stable');
      setUploadIsStable(true);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchVersions();
      fetchPlugin();
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? (err as any)?.message
        ?? "Failed to upload version";
      toast.error(message);
      console.error("uploadVersion failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (versionId: number) => {
    try {
      const res = await pluginService.getDownloadUrl(versionId);
      const url = res.data.data?.url || res.data.data;
      if (url) {
        window.open(url, "_blank");
      } else {
        toast.error("No download URL returned");
      }
    } catch {
      toast.error("Failed to get download URL");
    }
  };

  const handlePromote = async () => {
    if (!promoteVersion) return;
    setPromoting(true);
    try {
      await pluginService.promoteVersion(promoteVersion.id);
      toast.success(`Version ${promoteVersion.version} promoted to stable. Deployment to remaining sites will begin.`);
      setPromoteDialogOpen(false);
      setPromoteVersion(null);
      fetchVersions();
    } catch {
      toast.error("Failed to promote version");
    } finally {
      setPromoting(false);
    }
  };

  const fetchBetaStatus = async (versionId: number) => {
    try {
      const res = await pluginService.betaStatus(versionId);
      setBetaStatusMap((prev) => ({ ...prev, [versionId]: res.data.data }));
    } catch {
      toast.error("Failed to load beta status");
    }
  };

  const openEditDialog = () => {
    if (plugin) {
      setEditForm({
        name: plugin.name,
        description: plugin.description || "",
        author: plugin.author || "",
      });
      setEditDialogOpen(true);
    }
  };

  if (showLoader) {
    return <PageLoader variant="detail" />;
  }

  if (!plugin) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Plugin not found.</p>
      </div>
    );
  }

  return (
    <div className="page-content space-y-6">
      {/* Back link */}
      <Link
        href="/plugins"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Plugins
      </Link>

      {/* Plugin Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{plugin.name}</h1>
            <Badge variant={plugin.is_active ? "default" : "secondary"}>
              {plugin.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-muted-foreground font-mono text-sm">
            {plugin.slug}
          </p>
          {plugin.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {plugin.description}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={openEditDialog}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>

      {/* Plugin Info */}
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Author</dt>
              <dd className="mt-1">{plugin.author || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                Latest Version
              </dt>
              <dd className="mt-1">
                {plugin.latest_version ? (
                  <Badge variant="secondary">
                    {plugin.latest_version.version}
                  </Badge>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                Installed Sites
              </dt>
              <dd className="mt-1">{plugin.site_plugins_count ?? 0}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Created</dt>
              <dd className="mt-1">
                {format(new Date(plugin.created_at), "MMM d, yyyy")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Versions Tab */}
      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="upload">Upload New Version</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No versions uploaded yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Track</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Stable</TableHead>
                        <TableHead>Released By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>File Size</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((version) => (
                        <Fragment key={version.id}>
                        <TableRow>
                          <TableCell>
                            <Badge variant="outline">{version.version}</Badge>
                          </TableCell>
                          <TableCell>
                            {version.track === 'beta' ? (
                              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">BETA</span>
                            ) : (
                              <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-medium">STABLE</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {version.changelog?.type ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${changelogTypeColors[version.changelog.type] || changelogTypeColors.other}`}
                              >
                                {version.changelog.type}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {version.is_stable ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {version.released_by_user?.name || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(
                              new Date(version.released_at || version.created_at),
                              "MMM d, yyyy"
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatFileSize(version.file_size)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(version.id)}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {version.changelog && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedChangelog(version);
                                    setChangelogDialogOpen(true);
                                  }}
                                  title="View Changelog"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Push to Sites"
                                onClick={() => {
                                  setDeployVersion(version);
                                  setDeployDialogOpen(true);
                                }}
                              >
                                <Rocket className="h-4 w-4" />
                              </Button>
                              {version.track === 'beta' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1"
                                  onClick={() => {
                                    setPromoteVersion(version);
                                    setPromoteDialogOpen(true);
                                  }}
                                  title="Promote to Stable"
                                >
                                  <ArrowUpCircle className="h-4 w-4" />
                                  Promote
                                </Button>
                              )}
                              {version.track === 'beta' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Beta Status"
                                  onClick={() => {
                                    if (expandedBetaVersion === version.id) {
                                      setExpandedBetaVersion(null);
                                    } else {
                                      setExpandedBetaVersion(version.id);
                                      if (!betaStatusMap[version.id]) {
                                        fetchBetaStatus(version.id);
                                      }
                                    }
                                  }}
                                >
                                  <FlaskConical className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedBetaVersion === version.id && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-amber-50/50 border-amber-100">
                              {betaStatusMap[version.id] ? (
                                <div className="p-3 space-y-2">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <FlaskConical className="h-4 w-4 text-amber-600" />
                                    Beta Status
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Total Sites:</span>{" "}
                                      <span className="font-medium">{betaStatusMap[version.id].total_beta_sites}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Deployed:</span>{" "}
                                      <span className="font-medium">{betaStatusMap[version.id].deployed}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Healthy:</span>{" "}
                                      <span className="font-medium text-green-600">{betaStatusMap[version.id].healthy}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Failed:</span>{" "}
                                      <span className="font-medium text-red-600">{betaStatusMap[version.id].failed}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Rolled Back:</span>{" "}
                                      <span className="font-medium text-orange-600">{betaStatusMap[version.id].rolled_back}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-muted-foreground">Running for {betaStatusMap[version.id].days_running} day(s)</span>
                                    <span className={betaStatusMap[version.id].failed > 0 || betaStatusMap[version.id].rolled_back > 0 ? "text-amber-600" : "text-green-600"}>
                                      {betaStatusMap[version.id].status_message}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 text-sm text-muted-foreground">Loading beta status...</div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload New Version
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="version-file">Plugin File (.zip)</Label>
                <Input
                  id="version-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setUploadFile(file);
                  }}
                />
                {uploadFile && (
                  <p className="text-xs text-muted-foreground">
                    {uploadFile.name} ({formatFileSize(uploadFile.size)})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version-number">
                    Version <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="version-number"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    placeholder="1.0.0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version-type">Type</Label>
                  <Select value={uploadType} onValueChange={(val) => setUploadType(val ?? "feature")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="bugfix">Bugfix</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="breaking">Breaking</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="version-changelog">
                  Changelog <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="version-changelog"
                  value={uploadChangelog}
                  onChange={(e) => setUploadChangelog(e.target.value)}
                  placeholder="Describe the changes in this version..."
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Release Track</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="track"
                      value="stable"
                      checked={uploadTrack === 'stable'}
                      onChange={() => setUploadTrack('stable')}
                      className="h-4 w-4"
                    />
                    <span>Stable</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">STABLE</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="track"
                      value="beta"
                      checked={uploadTrack === 'beta'}
                      onChange={() => setUploadTrack('beta')}
                      className="h-4 w-4"
                    />
                    <span>Beta</span>
                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">BETA</span>
                  </label>
                </div>
                {uploadTrack === 'beta' && (
                  <p className="text-amber-600 text-sm mt-1">This version will only be pushed to beta tester sites.</p>
                )}
              </div>

              {uploadTrack === 'stable' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="version-stable"
                  checked={uploadIsStable}
                  onChange={(e) => setUploadIsStable(e.target.checked)}
                />
                <Label htmlFor="version-stable" className="cursor-pointer">
                  Mark as stable release
                </Label>
              </div>
              )}

              {uploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadVersion || !uploadChangelog.trim()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Uploading..." : "Upload Version"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Plugin Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Plugin</DialogTitle>
            <DialogDescription>
              Update the plugin details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-author">Author</Label>
              <Input
                id="edit-author"
                value={editForm.author}
                onChange={(e) =>
                  setEditForm({ ...editForm, author: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={editSubmitting || !editForm.name}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Changelog Dialog */}
      <Dialog open={changelogDialogOpen} onOpenChange={setChangelogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Changelog — v{selectedChangelog?.version}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedChangelog?.changelog ? (
              <div className="space-y-3">
                <Badge
                  className={
                    changelogTypeColors[selectedChangelog.changelog.type] ||
                    changelogTypeColors.other
                  }
                >
                  {selectedChangelog.changelog.type}
                </Badge>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedChangelog.changelog.content}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No changelog available.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setChangelogDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      {deployVersion && plugin && (
        <DeployDialog
          pluginVersionId={deployVersion.id}
          pluginName={plugin.name}
          version={deployVersion.version}
          open={deployDialogOpen}
          onOpenChange={setDeployDialogOpen}
        />
      )}

      {/* Promote to Stable Confirmation Dialog */}
      <AlertDialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Stable</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to promote <span className="font-semibold">v{promoteVersion?.version}</span> from beta to stable?
              This will deploy the version to all remaining (non-beta) sites.
              {betaStatusMap[promoteVersion?.id ?? 0] && (
                <span className="block mt-2 text-sm">
                  Beta status: {betaStatusMap[promoteVersion?.id ?? 0]?.healthy ?? 0} healthy,{" "}
                  {betaStatusMap[promoteVersion?.id ?? 0]?.failed ?? 0} failed,{" "}
                  {betaStatusMap[promoteVersion?.id ?? 0]?.rolled_back ?? 0} rolled back
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePromote}
              disabled={promoting}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {promoting ? "Promoting..." : "Promote to Stable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
