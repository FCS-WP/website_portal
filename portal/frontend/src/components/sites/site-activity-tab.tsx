"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, User, Globe, Clock } from "lucide-react";
import { siteService } from "@/lib/services/sites";
import { ActivityLog } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface SiteActivityTabProps {
  siteId: number;
}

function getActionBadgeVariant(action: string) {
  if (action.includes("created")) return "bg-green-100 text-green-800 hover:bg-green-100";
  if (action.includes("updated")) return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  if (action.includes("deleted")) return "bg-red-100 text-red-800 hover:bg-red-100";
  return "bg-gray-100 text-gray-800 hover:bg-gray-100";
}

function formatAction(action: string): string {
  return action
    .replace(/^site\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SiteActivityTab({ siteId }: SiteActivityTabProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const fetchActivities = useCallback(
    async (page: number, append = false) => {
      try {
        if (append) setLoadingMore(true);
        const res = await siteService.activity(siteId, { page });
        const data = res.data.data || [];
        const pagination = res.data.meta?.pagination;

        if (append) {
          setActivities((prev) => [...prev, ...data]);
        } else {
          setActivities(data);
        }

        if (pagination) {
          setCurrentPage(pagination.current_page);
          setLastPage(pagination.last_page);
        }
      } catch {
        toast.error("Failed to load activity logs");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [siteId]
  );

  useEffect(() => {
    if (siteId) fetchActivities(1);
  }, [siteId, fetchActivities]);

  const handleLoadMore = () => {
    if (currentPage < lastPage) {
      fetchActivities(currentPage + 1, true);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No activity recorded for this site yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {activities.map((log) => (
            <div key={log.id} className="flex items-start gap-4 p-4">
              {/* Timeline dot */}
              <div className="mt-1.5 flex-shrink-0">
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getActionBadgeVariant(log.action)}>
                    {formatAction(log.action)}
                  </Badge>
                  {log.user && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      {log.user.name}
                    </span>
                  )}
                </div>

                {/* Metadata */}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 inline-block">
                    {Object.entries(log.metadata).map(([key, value]) => (
                      <span key={key} className="mr-3">
                        <span className="font-medium">{key}:</span>{" "}
                        {String(value)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer info */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(log.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                  {log.ip_address && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {log.ip_address}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load More */}
        {currentPage < lastPage && (
          <div className="p-4 border-t text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Load More
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
