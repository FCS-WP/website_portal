"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Server,
  Users,
  Settings,
  Puzzle,
  Rocket,
  ShoppingCart,
  Mail,
  FileText,
  CalendarClock,
  Shield,
  AlertTriangle,
  Lock,
  RefreshCw,
  Download,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { sidebarService, SidebarCounts } from "@/lib/services/sidebar";

type Role = "admin" | "dev" | "mkt";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeVariant?: "info" | "warning";
  placeholder?: boolean;
  /** If set, only these roles see this item. Omit to allow everyone. */
  roles?: Role[];
}

interface NavGroup {
  label: string;
  /** Legacy flag — equivalent to roles=["admin"]. Kept so other groups don't break. */
  adminOnly?: boolean;
  /** If set, only these roles see this whole group. Falls back to per-item filtering. */
  roles?: Role[];
  items: NavItem[];
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const role = (user?.role ?? "mkt") as Role;
  const isAdmin = role === "admin";
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const res = await sidebarService.counts();
        if (!cancelled) setCounts(res.data.data);
      } catch {
        // silently ignore
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Role-based sidebar shape. Per our scope audit:
  //   admin → sees everything
  //   dev   → sees MAIN (no Hostings), PLUGINS, OPERATIONS, no SECURITY/ADMIN
  //   mkt   → sees Dashboard + Sites (MAIN) and Orders (OPERATIONS) only
  //
  // `roles` on a group hides the whole group. `roles` on an item hides
  // individual rows so we don't end up with an empty group header.
  const navGroups: NavGroup[] = [
    {
      label: "MAIN",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        {
          name: "Sites",
          href: "/sites",
          icon: Globe,
          badge: counts?.sites || undefined,
          badgeVariant: "info",
        },
        {
          name: "Hostings",
          href: "/hostings",
          icon: Server,
          badge: counts?.hostings || undefined,
          badgeVariant: "info",
          roles: ["admin"],
        },
      ],
    },
    {
      label: "PLUGINS",
      roles: ["admin", "dev"],
      items: [
        {
          name: "Updates",
          href: "/plugins/updates",
          icon: RefreshCw,
          badge: counts?.plugin_updates || undefined,
          badgeVariant: "warning",
        },
        { name: "Install", href: "/plugins/install", icon: Download },
        {
          name: "Repository",
          href: "/plugins",
          icon: Puzzle,
          badge: counts?.plugins || undefined,
          badgeVariant: "info",
        },
        {
          name: "Deployments",
          href: "/deployments",
          icon: Rocket,
          badge: counts?.active_deployments || undefined,
          badgeVariant: "warning",
        },
        { name: "Scheduled", href: "/deployments/scheduled", icon: CalendarClock },
      ],
    },
    {
      label: "SECURITY",
      roles: ["admin"],
      items: [
        { name: "Overview", href: "/security", icon: Shield },
        {
          name: "Alerts",
          href: "/security/alerts",
          icon: AlertTriangle,
          badge: counts?.security_alerts || undefined,
          badgeVariant: "warning",
        },
        { name: "2FA Management", href: "/security/2fa", icon: Lock },
      ],
    },
    {
      label: "OPERATIONS",
      items: [
        { name: "Orders", href: "/orders", icon: ShoppingCart },
        { name: "SMTP", href: "/smtp", icon: Mail, roles: ["admin", "dev"] },
        { name: "Activity Logs", href: "/activity-logs", icon: FileText, roles: ["admin", "dev"] },
      ],
    },
    {
      label: "ADMIN",
      adminOnly: true,
      items: [
        { name: "Users", href: "/users", icon: Users },
        { name: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ];

  const canSeeGroup = (group: NavGroup): boolean => {
    if (group.adminOnly && !isAdmin) return false;
    if (group.roles && !group.roles.includes(role)) return false;
    return true;
  };

  const canSeeItem = (item: NavItem): boolean => {
    if (item.roles && !item.roles.includes(role)) return false;
    return true;
  };

  // First filter items inside each group, then drop any group that
  // ended up with zero visible items (so we don't render an empty header).
  const filteredGroups = navGroups
    .filter(canSeeGroup)
    .map((g) => ({ ...g, items: g.items.filter(canSeeItem) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r bg-sidebar">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">EPOS Portal</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Central Platform</span>
          </div>
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || 
                  (pathname.startsWith(item.href + "/") && 
                   !group.items.some((other) => other.href !== item.href && pathname.startsWith(other.href)));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      // Base: row layout + a transparent left border that the
                      // active state lights up. Using a border slot avoids
                      // layout shift between active/inactive states.
                      "flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? // Active: primary-tinted background, primary text,
                          // and a primary left accent. Icon picks up the
                          // primary color through `[&_svg]:text-primary` so
                          // the whole row reads as the selected nav item.
                          "border-primary bg-primary/10 text-primary [&_svg]:text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={cn(
                          "ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none tabular-nums",
                          item.badgeVariant === "warning"
                            ? "bg-amber-500 text-white dark:bg-amber-600"
                            : "bg-muted-foreground/20 text-muted-foreground"
                        )}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Footer */}
      {user && (
        <div className="border-t px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {user.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "U"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{user.name}</span>
              <span className="text-[11px] text-muted-foreground capitalize">{user.role === "admin" ? "Administrator" : user.role === "dev" ? "Developer" : "Marketing"}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
