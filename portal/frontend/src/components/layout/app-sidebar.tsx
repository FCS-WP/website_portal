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
  ListChecks,
  Menu,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { User } from "@/types";
import { cn } from "@/lib/utils";
import { sidebarService, SidebarCounts } from "@/lib/services/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Role = "admin" | "dev" | "mkt";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeVariant?: "info" | "warning";
  roles?: Role[];
}

interface NavGroup {
  label: string;
  adminOnly?: boolean;
  roles?: Role[];
  items: NavItem[];
}

function useSidebarCounts() {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const res = await sidebarService.counts();
        if (!cancelled) {
          setCounts(res.data.data);
        }
      } catch {
        // silently ignore
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return counts;
}

function getNavGroups(counts: SidebarCounts | null): NavGroup[] {
  return [
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
        { name: "Queue", href: "/queue", icon: ListChecks, roles: ["admin", "dev"] },
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
}

function getFilteredGroups(role: Role, counts: SidebarCounts | null) {
  const isAdmin = role === "admin";

  return getNavGroups(counts)
    .filter((group) => {
      if (group.adminOnly && !isAdmin) return false;
      if (group.roles && !group.roles.includes(role)) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

function BrandBlock() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
        <LayoutDashboard className="h-4 w-4 text-white" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold leading-tight">EPOS Portal</span>
        <span className="truncate text-[11px] leading-tight text-muted-foreground">
          Central Platform
        </span>
      </div>
    </Link>
  );
}

function UserFooter({ user }: { user: User | null }) {
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {user.name
          ?.split(" ")
          .map((n: string) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "U"}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="text-[11px] capitalize text-muted-foreground">
          {user.role === "admin"
            ? "Administrator"
            : user.role === "dev"
              ? "Developer"
              : "Marketing"}
        </span>
      </div>
    </div>
  );
}

function SidebarNavSections({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (pathname.startsWith(item.href + "/") &&
                  !group.items.some(
                    (other) => other.href !== item.href && pathname.startsWith(other.href)
                  ));

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary [&_svg]:text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{item.name}</span>
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
    </>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const role = (user?.role ?? "mkt") as Role;
  const counts = useSidebarCounts();
  const filteredGroups = getFilteredGroups(role, counts);

  return (
    <aside className="hidden border-r bg-sidebar lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <BrandBlock />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <SidebarNavSections groups={filteredGroups} pathname={pathname} />
      </nav>

      {user && (
        <div className="border-t px-4 py-3">
          <UserFooter user={user} />
        </div>
      )}
    </aside>
  );
}

export function AppSidebarMobile() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const role = (user?.role ?? "mkt") as Role;
  const counts = useSidebarCounts();
  const filteredGroups = getFilteredGroups(role, counts);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Open navigation"
          />
        }
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>

      <SheetContent side="left" className="w-[min(20rem,calc(100vw-1rem))] p-0 lg:hidden">
        <SheetHeader className="border-b pr-14">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse the portal sections
          </SheetDescription>
          <BrandBlock />
        </SheetHeader>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <SidebarNavSections
            groups={filteredGroups}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </nav>

        {user && (
          <div className="border-t px-4 py-3">
            <UserFooter user={user} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
