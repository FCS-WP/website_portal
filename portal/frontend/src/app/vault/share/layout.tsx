import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Credentials — EPOS Portal",
  description: "Securely view shared credentials",
};

export default function VaultShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Portal branding header */}
      <header className="border-b bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-xs font-bold text-primary-foreground">E</span>
          </div>
          <span className="font-semibold text-sm">EPOS Portal</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-gray-900 px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Shared securely via EPOS Portal
        </p>
      </footer>
    </div>
  );
}
