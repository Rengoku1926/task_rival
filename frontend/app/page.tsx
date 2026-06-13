"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { FullPageSpinner } from "@/components/ui/Spinner";

export default function Home() {
  const router = useRouter();
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (isInitializing) return;
    router.replace(accessToken ? "/tasks" : "/login");
  }, [isInitializing, accessToken, router]);

  return <FullPageSpinner />;
}
