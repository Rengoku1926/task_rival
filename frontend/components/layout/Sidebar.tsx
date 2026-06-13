"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KanbanSquare, ListChecks, LogOut, PlusCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { logout as logoutApi } from "@/lib/auth";

const links = [
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/tasks/new", label: "New Task", icon: PlusCircle },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-primary" />
      )}
      <Icon
        className={cn(
          "size-4.5 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const clear = useAuthStore((s) => s.clear);

  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      // ignore network errors on logout
    }
    clear();
    toast.success("Logged out");
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <Link href="/tasks" className="flex items-center gap-2.5 px-6 pb-6 pt-7">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/40">
          <KanbanSquare className="size-4.5 text-primary-foreground" />
        </span>
        <span className="text-lg font-bold tracking-tight text-foreground">
          Task<span className="text-primary">Rival</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Menu
        </p>
        {links.map((link) => (
          <NavLink key={link.href} {...link} active={pathname === link.href} />
        ))}
        {role === "admin" && (
          <NavLink
            href="/admin"
            label="Admin"
            icon={ShieldCheck}
            active={pathname === "/admin"}
          />
        )}
      </nav>

      <div className="border-t border-border/80 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <LogOut className="size-4.5" />
          Logout
        </button>
      </div>
    </div>
  );
}
