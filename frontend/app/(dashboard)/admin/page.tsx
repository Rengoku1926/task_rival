"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useAdminTasksQuery } from "@/hooks/useTasks";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";
import type { TaskListParams } from "@/types";

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useState<TaskListParams>({
    page: 1,
    per_page: 20,
    sort: "created_at",
    order: "desc",
  });

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/tasks");
    }
  }, [user, router]);

  const { data, isLoading } = useAdminTasksQuery(params);

  if (!user || user.role !== "admin") {
    return <FullPageSpinner />;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
          All Tasks
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            <ShieldCheck className="size-3.5" />
            Admin
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse every task across all users.
        </p>
      </div>

      <TaskFilters value={params} onChange={setParams} />

      {isLoading ? (
        <FullPageSpinner />
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No tasks found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/80 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Owner</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Priority</th>
                <th className="px-5 py-3 font-semibold">Due</th>
                <th className="px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {data.items.map((task) => (
                <tr key={task.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3.5 font-semibold text-foreground">
                    <Link href={`/tasks/${task.id}`} className="hover:text-primary">
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {task.owner_name ?? `${task.user_id.slice(0, 8)}…`}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{formatDate(task.due_date)}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{formatDate(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {totalPages} &middot; {data.total} tasks
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= totalPages}
              onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
