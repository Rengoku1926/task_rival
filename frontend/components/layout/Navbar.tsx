"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  // Keep the input in sync when navigation clears or changes the query.
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Debounced global search: routes to the board with ?q=
  useEffect(() => {
    const handle = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (search === current) return;
      const target = search ? `/tasks?q=${encodeURIComponent(search)}` : "/tasks";
      if (pathname === "/tasks") {
        router.replace(target);
      } else if (search) {
        router.push(target);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/80 bg-card/90 px-4 backdrop-blur-sm sm:px-6">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="h-10 w-full rounded-full border border-input bg-background/60 pl-10 pr-4 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 focus:border-primary focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/15"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {user && (
          <div className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 sm:border sm:border-border/80 sm:bg-background/60">
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
              {initials(user.name)}
            </span>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold leading-tight text-foreground">{user.name}</p>
              <p className="text-[11px] capitalize leading-tight text-muted-foreground">
                {user.role}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
