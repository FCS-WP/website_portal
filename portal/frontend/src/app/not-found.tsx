import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Compass className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            404
          </p>
          <h1 className="text-3xl font-bold">Page not found</h1>
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button render={<Link href="/dashboard" />}>
            <Home className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
