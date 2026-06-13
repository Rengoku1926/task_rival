import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/types";

const statusClasses: Record<TaskStatus, string> = {
  todo: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
  in_progress: "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
  done: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
};

const statusDotClasses: Record<TaskStatus, string> = {
  todo: "bg-rose-500",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const priorityClasses: Record<TaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-500/20",
  medium: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  high: "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
};

const priorityDotClasses: Record<TaskPriority, string> = {
  low: "bg-zinc-400",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        statusClasses[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", statusDotClasses[status])} />
      {statusLabels[status]}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
        priorityClasses[priority],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", priorityDotClasses[priority])} />
      {priority}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border/60",
        className,
      )}
    >
      {children}
    </span>
  );
}
