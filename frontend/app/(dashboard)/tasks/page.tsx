"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlarmClock,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  Circle,
  KanbanSquare,
  LayoutGrid,
  List,
  Plus,
  Timer,
} from "lucide-react";
import { useTasksQuery, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { DeleteTaskDialog } from "@/components/tasks/DeleteTaskDialog";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { isOverdue } from "@/components/tasks/TaskCard";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", iconClass)}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xl font-bold leading-tight text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "board" | "list";
  onChange: (view: "board" | "list") => void;
}) {
  return (
    <div className="flex rounded-xl border border-border/80 bg-card p-1 shadow-xs">
      {(
        [
          { id: "board", label: "Board", icon: LayoutGrid },
          { id: "list", label: "List", icon: List },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            view === id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function TasksPageInner() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;

  const user = useAuthStore((s) => s.user);
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"board" | "list">("board");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("todo");
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const { data, isLoading } = useTasksQuery({ page: 1, per_page: 100, sort, order, q });
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const tasks = data?.items ?? [];
  const counts = {
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter(isOverdue).length,
  };

  function openCreate(status: TaskStatus = "todo") {
    setCreateStatus(status);
    setCreateOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
            Task Board
            <KanbanSquare className="size-5 text-primary" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user ? `Welcome back, ${user.name.split(" ")[0]}. ` : ""}
            {q ? (
              <>
                Showing results for <span className="font-semibold text-foreground">&ldquo;{q}&rdquo;</span>
              </>
            ) : (
              "Here's what's on your plate."
            )}
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="size-4" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="To Do"
          value={counts.todo}
          icon={Circle}
          iconClass="bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400"
        />
        <StatCard
          label="In Progress"
          value={counts.in_progress}
          icon={Timer}
          iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
        />
        <StatCard
          label="Done"
          value={counts.done}
          icon={CheckCircle2}
          iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          icon={AlarmClock}
          iconClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle view={view} onChange={setView} />
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Created date</SelectItem>
              <SelectItem value="due_date">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
          >
            {order === "desc" ? (
              <ArrowDownWideNarrow className="size-4" />
            ) : (
              <ArrowUpNarrowWide className="size-4" />
            )}
            {order === "desc" ? "Newest" : "Oldest"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : view === "board" ? (
        <KanbanBoard
          tasks={tasks}
          onStatusChange={(task, status) => updateTask.mutate({ id: task.id, status })}
          onDelete={setTaskToDelete}
          onAddTask={openCreate}
        />
      ) : (
        <TaskListView tasks={tasks} onDelete={setTaskToDelete} />
      )}

      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} defaultStatus={createStatus} />
      <DeleteTaskDialog
        task={taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        onConfirm={(task) => {
          deleteTask.mutate(task.id);
          setTaskToDelete(null);
        }}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <TasksPageInner />
    </Suspense>
  );
}
