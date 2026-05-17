"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { canAccessPath, fallbackPathFor, type Role } from "@/lib/access-control";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hydrate, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Route guard: once we know who the user is, redirect them off pages they
  // can't see. Runs after the auth check so we don't ping /login → / loop.
  // Uses the same rule table as the sidebar so the two can't disagree.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    const role = user.role as Role;
    if (!canAccessPath(role, pathname)) {
      toast.error("You don't have access to that page.");
      router.replace(fallbackPathFor(role));
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex flex-col flex-1 lg:pl-64">
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
