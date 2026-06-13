"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { TaskForm, type TaskFormValues } from "@/components/tasks/TaskForm";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { useCreateTask } from "@/hooks/useTasks";

export default function NewTaskPage() {
  const router = useRouter();
  const createTask = useCreateTask();

  async function handleSubmit(values: TaskFormValues) {
    const task = await createTask.mutateAsync({
      title: values.title,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      due_date: values.due_date ? values.due_date.toISOString() : null,
    });
    router.push(`/tasks/${task.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent">
            <Sparkles className="size-5 text-primary" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">New Task</h1>
            <p className="text-sm text-muted-foreground">
              Add a task to your board. You can drag it between columns later.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <TaskForm
            submitLabel="Create task"
            loading={createTask.isPending}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/tasks")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
