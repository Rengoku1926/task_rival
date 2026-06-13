import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isInitializing: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  setInitializing: (value: boolean) => void;
}

// Only `user` is persisted (non-sensitive profile info, used to rehydrate the
// UI instantly on reload). The access token always lives in memory and is
// re-obtained via POST /auth/refresh (httpOnly cookie) on page load.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isInitializing: true,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ user: null, accessToken: null }),
      setInitializing: (value) => set({ isInitializing: value }),
    }),
    {
      name: "auth-store",
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
