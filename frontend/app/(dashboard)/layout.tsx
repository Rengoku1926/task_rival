"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSSE } from "@/hooks/useSSE";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { FullPageSpinner } from "@/components/ui/Spinner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const accessToken = useAuthStore((s) => s.accessToken);

  useSSE();

  useEffect(() => {
    if (!isInitializing && !accessToken) {
      router.replace("/login");
    }
  }, [isInitializing, accessToken, router]);

  if (isInitializing || !accessToken) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-border/80 md:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <Suspense fallback={<div className="h-16 border-b border-border/80 bg-card" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
