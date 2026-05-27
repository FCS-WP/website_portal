import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Manrope: friendly geometric sans with slightly rounded character.
// Variable font, so one file covers all weights.
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Keep a code font for the few `<code>` / `<pre>` blocks (env displays,
// plugin slugs, etc.). JetBrains Mono pairs cleanly with Manrope.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EPOS Portal",
  description: "EPOS WordPress Site Management Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // next-themes mutates <html> before hydration; suppress the resulting
      // mismatch warning since it's intentional (theme is set from
      // localStorage / media query on first paint).
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body
        // Some browser extensions inject attributes into <body> before React
        // hydrates in dev, which produces a noisy mismatch overlay.
        suppressHydrationWarning
        className="min-h-full flex flex-col"
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
