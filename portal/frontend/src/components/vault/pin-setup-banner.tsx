"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinSetupDialog } from "./pin-setup-dialog";
import { useAuthStore } from "@/stores/auth-store";

export function PinSetupBanner() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const handleSuccess = () => {
    setDialogOpen(false);
    // Refresh user data so has_vault_pin updates
    fetchUser();
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Set up your Vault PIN to access site credentials
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            A 6-digit PIN is required to view or manage sensitive data like API keys and passwords.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
          onClick={() => setDialogOpen(true)}
        >
          Set up PIN
        </Button>
      </div>

      <PinSetupDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
