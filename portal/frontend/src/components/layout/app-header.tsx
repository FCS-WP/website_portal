"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebarMobile } from "./app-sidebar";

export function AppHeader() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const roleBadgeColor: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
    dev:   "bg-blue-100   text-blue-800   dark:bg-blue-500/15   dark:text-blue-300",
    mkt:   "bg-green-100  text-green-800  dark:bg-green-500/15  dark:text-green-300",
  };

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <AppSidebarMobile />
        <div className="min-w-0 lg:hidden">
          <span className="text-xl font-extrabold lowercase tracking-tight text-primary">
            zippy
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        {user && (
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="hidden truncate text-sm font-medium md:inline">
            {user.name}
          </span>
          <Badge
            variant="secondary"
            className={`hidden sm:inline-flex ${roleBadgeColor[user.role] || ""}`}
          >
            {user.role.toUpperCase()}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="relative h-8 w-8 rounded-full" />}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
