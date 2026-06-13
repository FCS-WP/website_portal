"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Fatal root-layout error:", error);
  }, [error]);

  // global-error replaces the root layout, so Tailwind / ThemeProvider /
  // fonts are NOT available here. Keep markup self-contained and lean.
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#a3a3a3",
              marginBottom: "0.5rem",
            }}
          >
            Fatal error
          </p>
          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 700,
              marginTop: 0,
              marginBottom: "0.75rem",
            }}
          >
            The portal couldn&apos;t start
          </h1>
          <p style={{ color: "#a3a3a3", marginTop: 0 }}>
            Something went wrong while loading the app. Refresh the page; if
            it keeps happening, share the reference code below with support.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "#a3a3a3",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #525252",
              background: "#171717",
              color: "#f5f5f5",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
