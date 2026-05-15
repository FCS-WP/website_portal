"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { siteService } from "@/lib/services/sites";
import { Site } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { Globe, Server, Calendar, Code, Plug } from "lucide-react";

export default function SiteDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSite() {
      try {
        const res = await siteService.show(id);
        setSite(res.data.data);
      } catch {
        toast.error("Failed to load site details");
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchSite();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Site not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{site.name}</h1>
        <StatusBadge status={site.status} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="smtp">SMTP</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Site Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Site Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">URL</dt>
                  <dd className="mt-1">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {site.url}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={site.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Server className="h-3 w-3" /> Hosting
                  </dt>
                  <dd className="mt-1">{site.hosting?.name || "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Code className="h-3 w-3" /> WP Version
                  </dt>
                  <dd className="mt-1">{site.wp_version || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">PHP Version</dt>
                  <dd className="mt-1">{site.php_version || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Plug className="h-3 w-3" /> WooCommerce
                  </dt>
                  <dd className="mt-1">
                    <Badge variant={site.woo_active ? "default" : "secondary"}>
                      {site.woo_active ? "Active" : "Inactive"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Last Ping
                  </dt>
                  <dd className="mt-1">
                    {site.last_ping_at
                      ? format(new Date(site.last_ping_at), "MMM d, yyyy HH:mm")
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                  <dd className="mt-1">
                    {format(new Date(site.created_at), "MMM d, yyyy")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Description */}
          {site.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{site.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {site.tags && site.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {site.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assigned Users */}
          {site.users && site.users.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {site.users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="secondary">{user.role}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plugins" className="mt-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Plugin management coming in Phase 2.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Order syncing coming in Phase 3.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp" className="mt-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                SMTP configuration coming in Phase 2.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Activity log coming in Phase 2.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
