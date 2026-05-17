"use client";

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
import { Badge } from "@/components/ui/badge";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  placeholder?: boolean;
}

interface NavGroup {
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

export function AppSidebar({ offlineSitesCount }: { offlineSitesCount?: number }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const navGroups: NavGroup[] = [
    {
      label: "MAIN",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        {
          name: "Sites",
          href: "/sites",
          icon: Globe,
          badge: offlineSitesCount && offlineSitesCount > 0 ? offlineSitesCount : undefined,
        },
        { name: "Hostings", href: "/hostings", icon: Server },
      ],
    },
    {
      label: "PLUGINS",
      items: [
        { name: "Updates", href: "/plugins/updates", icon: RefreshCw },
        { name: "Install", href: "/plugins/install", icon: Download },
        { name: "Repository", href: "/plugins", icon: Puzzle },
        { name: "Deployments", href: "/deployments", icon: Rocket },
        { name: "Scheduled", href: "/deployments/scheduled", icon: CalendarClock },
      ],
    },
    {
      label: "SECURITY",
      items: [
        { name: "Overview", href: "/security", icon: Shield },
        { name: "Alerts", href: "/security/alerts", icon: AlertTriangle },
        { name: "2FA Management", href: "/security/2fa", icon: Lock },
      ],
    },
    {
      label: "OPERATIONS",
      items: [
        { name: "Orders", href: "/orders", icon: ShoppingCart, placeholder: true },
        { name: "SMTP", href: "/smtp", icon: Mail, placeholder: true },
        { name: "Activity Logs", href: "/activity-logs", icon: FileText },
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

  const filteredGroups = navGroups.filter(
    (group) => !group.adminOnly || isAdmin
  );

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
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.name}</span>
                    {item.badge !== undefined && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 px-1.5 text-[10px] font-semibold"
                      >
                        {item.badge}
                      </Badge>
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
