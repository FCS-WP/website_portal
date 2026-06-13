import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Credentials — Zippy",
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
          <span className="text-lg font-extrabold lowercase tracking-tight text-primary">
            zippy
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-gray-900 px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Shared securely via Zippy
        </p>
      </footer>
    </div>
  );
}
