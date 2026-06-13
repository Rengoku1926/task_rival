"use client";

import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { CalendarDays, GripVertical, Trash2 } from "lucide-react";
import { PriorityBadge } from "@/components/ui/Badge";
import { formatDate, cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";

interface TaskCardProps {
  task: Task;
  onDelete: () => void;
  /** Render-only mode used inside the DragOverlay. */
  overlay?: boolean;
}

const ACCENT_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-rose-500",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
};

export function isOverdue(task: Task): boolean {
  return !!task.due_date && task.status !== "done" && new Date(task.due_date) < new Date();
}

export function TaskCardContent({ task, onDelete, overlay }: TaskCardProps) {
  return (
    <>
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-sm font-semibold leading-snug text-foreground">
          {task.title}
        </h3>
        {!overlay && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete task"
            className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground/0 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:text-muted-foreground dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border/60">
          #{task.id.slice(0, 6)}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
        {task.due_date ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium",
              isOverdue(task) ? "text-red-500" : "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-3.5" />
            {formatDate(task.due_date)}
            {isOverdue(task) && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                Overdue
              </span>
            )}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">No due date</span>
        )}
        <GripVertical className="size-3.5 text-muted-foreground/40" />
      </div>
    </>
  );
}

export function TaskCard({ task, onDelete }: TaskCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => router.push(`/tasks/${task.id}`)}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "group relative flex cursor-grab flex-col gap-2.5 overflow-hidden rounded-2xl border border-border/80 bg-card p-3.5 pt-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg active:cursor-grabbing",
        isDragging && "z-50 opacity-40",
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", ACCENT_CLASSES[task.status])} />
      <TaskCardContent task={task} onDelete={onDelete} />
    </div>
  );
}
