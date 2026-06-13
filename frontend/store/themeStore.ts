import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  dark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      dark: false,
      toggle: () => set({ dark: !get().dark }),
      setDark: (dark) => set({ dark }),
    }),
    { name: "theme-store" },
  ),
);
