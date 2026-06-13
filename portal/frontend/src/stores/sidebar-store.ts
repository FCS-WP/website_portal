import { create } from "zustand";

const STORAGE_KEY = "sidebar_collapsed";

interface SidebarState {
  collapsed: boolean;
  hydrated: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  hydrate: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  // Always render expanded on the server so the first paint matches the
  // SSR markup; the real user pref is applied after hydrate() runs in
  // a client effect, avoiding a flash + Next hydration mismatch.
  collapsed: false,
  hydrated: false,

  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    set({ collapsed: raw === "1", hydrated: true });
  },

  toggle: () => {
    const next = !get().collapsed;
    set({ collapsed: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  },

  setCollapsed: (collapsed) => {
    set({ collapsed });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    }
  },
}));
