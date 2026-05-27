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
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
