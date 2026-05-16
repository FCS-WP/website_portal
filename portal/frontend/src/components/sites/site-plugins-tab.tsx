"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ExternalLink, Package } from "lucide-react";
import { siteService } from "@/lib/services/sites";
import { SitePlugin } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

interface SitePluginsTabProps {
  siteId: number;
}

export function SitePluginsTab({ siteId }: SitePluginsTabProps) {
  const [plugins, setPlugins] = useState<SitePlugin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlugins() {
      try {
        const res = await siteService.plugins(siteId);
        setPlugins(res.data.data || []);
      } catch {
        toast.error("Failed to load site plugins");
      } finally {
        setLoading(false);
      }
    }
    if (siteId) fetchPlugins();
  }, [siteId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (plugins.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No company plugins installed on this site. Plugins will appear here
            after the EPOS Agent reports them during its next ping.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plugin Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Installed</TableHead>
              <TableHead>Latest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Last Synced</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plugins.map((sp) => (
              <TableRow key={sp.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/plugins/${sp.plugin.id}`}
                    className="text-primary hover:underline"
                  >
                    {sp.plugin.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {sp.plugin.slug}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {sp.installed_version || "—"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {sp.latest_version || "—"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {sp.is_outdated ? (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                      Update Available
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      Up to Date
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        sp.is_active ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="text-sm">
                      {sp.is_active ? "Active" : "Inactive"}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {sp.last_synced_at
                    ? format(new Date(sp.last_synced_at), "MMM d, yyyy HH:mm")
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/plugins/${sp.plugin.id}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Plugin
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
