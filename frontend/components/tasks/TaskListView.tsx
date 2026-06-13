"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Inbox, Trash2 } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/ui/Badge";
import { isOverdue } from "@/components/tasks/TaskCard";
import { formatDate, cn } from "@/lib/utils";
import type { Task } from "@/types";

interface TaskListViewProps {
  tasks: Task[];
  onDelete: (task: Task) => void;
}

export function TaskListView({ tasks, onDelete }: TaskListViewProps) {
  const router = useRouter();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
        <Inbox className="size-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No tasks found</p>
        <p className="text-xs text-muted-foreground">
          Try adjusting your search or create a new task.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <ul className="divide-y divide-border/70">
        {tasks.map((task) => (
          <li
            key={task.id}
            onClick={() => router.push(`/tasks/${task.id}`)}
            className="group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:px-5"
          >
            <span
              className={cn(
                "h-9 w-1 shrink-0 rounded-full",
                task.status === "todo" && "bg-rose-500",
                task.status === "in_progress" && "bg-blue-500",
                task.status === "done" && "bg-emerald-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
              {task.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description}</p>
              )}
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>

            <span
              className={cn(
                "hidden w-28 items-center gap-1.5 text-xs font-medium md:inline-flex",
                isOverdue(task) ? "text-red-500" : "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-3.5 shrink-0" />
              {task.due_date ? formatDate(task.due_date) : "—"}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task);
              }}
              aria-label="Delete task"
              className="cursor-pointer rounded-lg p-2 text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <Trash2 className="size-4" />
            </button>
            <ChevronRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </li>
        ))}
      </ul>
    </div>
  );
}
