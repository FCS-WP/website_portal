"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Wifi, WifiOff, Users } from "lucide-react";
import { siteService } from "@/lib/services/sites";
import { userService } from "@/lib/services/users";
import { Site, User } from "@/types";

interface Stats {
  totalSites: number;
  connected: number;
  disconnected: number;
  totalUsers: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [sitesRes, usersRes] = await Promise.all([
          siteService.list(),
          userService.list(),
        ]);

        const sites: Site[] = sitesRes.data.data || [];
        const users: User[] = usersRes.data.data || [];

        setStats({
          totalSites: sites.length,
          connected: sites.filter((s) => s.status === "connected").length,
          disconnected: sites.filter((s) => s.status === "disconnected").length,
          totalUsers: users.length,
        });
      } catch {
        // Silently fail — stats will show 0
        setStats({ totalSites: 0, connected: 0, disconnected: 0, totalUsers: 0 });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Total Sites",
      value: stats?.totalSites ?? 0,
      icon: Globe,
      color: "text-blue-600",
    },
    {
      title: "Connected",
      value: stats?.connected ?? 0,
      icon: Wifi,
      color: "text-green-600",
    },
    {
      title: "Disconnected",
      value: stats?.disconnected ?? 0,
      icon: WifiOff,
      color: "text-red-600",
    },
    {
      title: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your WordPress sites and system status
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{card.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
