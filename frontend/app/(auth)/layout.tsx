"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KanbanSquare } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { FullPageSpinner } from "@/components/ui/Spinner";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!isInitializing && accessToken) {
      router.replace("/tasks");
    }
  }, [isInitializing, accessToken, router]);

  if (isInitializing) {
    return <FullPageSpinner />;
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-background px-4">
      {/* Soft decorative glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
            <KanbanSquare className="size-6 text-primary-foreground" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Task<span className="text-primary">Rival</span>
          </h1>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-lg shadow-black/5 sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}
