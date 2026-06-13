"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { me, refresh } from "@/lib/auth";

function ThemeSync() {
  const dark = useThemeStore((s) => s.dark);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [dark]);

  return null;
}

function AuthBootstrap() {
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { access_token } = await refresh();
        if (cancelled) return;
        useAuthStore.getState().setAccessToken(access_token);

        const { user } = await me();
        if (cancelled) return;
        useAuthStore.getState().setAuth(user, access_token);
      } catch {
        // no valid session — drop any stale persisted user
        if (!cancelled) useAuthStore.getState().clear();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setInitializing]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <AuthBootstrap />
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
