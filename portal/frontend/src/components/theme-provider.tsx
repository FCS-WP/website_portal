"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin client-only wrapper around next-themes' provider.
 *
 * - attribute="class" so the active theme is applied as a CSS class on <html>
 *   (matches our `@custom-variant dark (&:is(.dark *))` in globals.css)
 * - defaultTheme="system" so we honor the OS preference for first-time users
 * - enableSystem ensures the "system" choice is available in the toggle menu
 *   if we expand to a 3-option picker later
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
