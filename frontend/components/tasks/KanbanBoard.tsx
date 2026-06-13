"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { TaskCard, TaskCardContent } from "@/components/tasks/TaskCard";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";

const COLUMNS: {
  status: TaskStatus;
  label: string;
  bar: string;
  count: string;
}[] = [
  {
    status: "todo",
    label: "To Do",
    bar: "bg-rose-500",
    count: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
  },
  {
    status: "in_progress",
    label: "In Progress",
    bar: "bg-blue-500",
    count: "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
  },
  {
    status: "done",
    label: "Done",
    bar: "bg-emerald-500",
    count: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  },
];

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
}

function KanbanColumn({
  column,
  tasks,
  onDelete,
  onAddTask,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  onDelete: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-muted/40 shadow-xs">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2.5 pb-3">
          <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
              column.count,
            )}
          >
            {tasks.length}
          </span>
        </div>
        <div className="h-[3px] w-full rounded-full bg-border/60">
          <div className={cn("h-full w-14 rounded-full", column.bar)} />
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "scrollbar-thin flex max-h-[calc(100vh-22rem)] min-h-32 flex-col gap-3 overflow-y-auto p-3 transition-colors",
          isOver && "rounded-xl bg-accent/60",
        )}
      >
        {tasks.length === 0 ? (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-border py-8 text-xs font-medium text-muted-foreground/60 transition-colors",
              isOver && "border-primary/50 text-primary",
            )}
          >
            Drop tasks here
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onDelete={() => onDelete(task)} />
          ))
        )}
      </div>

      <div className="p-3 pt-0">
        <button
          onClick={() => onAddTask(column.status)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card hover:text-primary"
        >
          <Plus className="size-3.5" />
          Add task
        </button>
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, onStatusChange, onDelete, onAddTask }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // A small drag-start distance keeps plain clicks working for navigation.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current?.task as Task) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const task = event.active.data.current?.task as Task | undefined;
    const overStatus = event.over?.id as TaskStatus | undefined;
    setActiveTask(null);
    if (task && overStatus && task.status !== overStatus) {
      onStatusChange(task, overStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.status}
            column={column}
            tasks={tasks.filter((t) => t.status === column.status)}
            onDelete={onDelete}
            onAddTask={onAddTask}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200 }}>
        {activeTask && (
          <div className="relative flex rotate-2 cursor-grabbing flex-col gap-2.5 overflow-hidden rounded-2xl border border-primary/40 bg-card p-3.5 pt-4 shadow-xl ring-2 ring-primary/20">
            <span
              className={cn(
                "absolute inset-x-0 top-0 h-1",
                COLUMNS.find((c) => c.status === activeTask.status)?.bar,
              )}
            />
            <TaskCardContent task={activeTask} onDelete={() => {}} overlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
