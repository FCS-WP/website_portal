"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface for browser-devtools / Sentry-style collectors. We don't
    // expose error.message in the UI — only the digest, which is safe
    // and lets ops correlate a user report with server logs.
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Something went wrong
          </p>
          <h1 className="text-3xl font-bold">We hit an unexpected error</h1>
          <p className="text-muted-foreground">
            The page failed to load. You can try again or head back to the
            dashboard. If this keeps happening, share the reference code below
            with support.
          </p>
          {error.digest && (
            <p className="pt-2 font-mono text-xs text-muted-foreground">
              ref: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => unstable_retry()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" render={<Link href="/dashboard" />}>
            <Home className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
