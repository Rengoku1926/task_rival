"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useTaskQuery, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { TaskForm, type TaskFormValues } from "@/components/tasks/TaskForm";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { TaskActivity } from "@/components/tasks/TaskActivity";
import { DeleteTaskDialog } from "@/components/tasks/DeleteTaskDialog";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { formatDateTime } from "@/lib/utils";
import type { Task } from "@/types";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const { data: task, isLoading } = useTaskQuery(id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  if (isLoading) return <FullPageSpinner />;
  if (!task) {
    return <p className="text-sm text-muted-foreground">Task not found.</p>;
  }

  async function handleSubmit(values: TaskFormValues) {
    await updateTask.mutateAsync({
      id: task!.id,
      title: values.title,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      due_date: values.due_date ? values.due_date.toISOString() : null,
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/tasks")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to board
        </button>
        <Button variant="danger" size="sm" onClick={() => setTaskToDelete(task)}>
          <Trash2 className="size-4" />
          Delete task
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border/60">
                  #{task.id.slice(0, 6)}
                </span>
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
              <h1 className="mt-2.5 text-xl font-bold tracking-tight text-foreground">
                {task.title}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {formatDateTime(task.created_at)} &middot; Last updated{" "}
                {formatDateTime(task.updated_at)}
              </p>
            </CardHeader>
            <CardContent>
              <TaskForm
                key={task.updated_at}
                initial={task}
                submitLabel="Save changes"
                loading={updateTask.isPending}
                onSubmit={handleSubmit}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <TaskAttachments taskId={task.id} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <TaskActivity taskId={task.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteTaskDialog
        task={taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        onConfirm={(t) => {
          setTaskToDelete(null);
          deleteTask.mutate(t.id, { onSuccess: () => router.push("/tasks") });
        }}
      />
    </div>
  );
}
