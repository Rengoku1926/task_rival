"use client";

import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { TaskForm, type TaskFormValues } from "@/components/tasks/TaskForm";
import { useCreateTask } from "@/hooks/useTasks";
import type { TaskStatus } from "@/types";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: TaskStatus;
}

export function TaskDialog({ open, onOpenChange, defaultStatus = "todo" }: TaskDialogProps) {
  const createTask = useCreateTask();

  async function handleSubmit(values: TaskFormValues) {
    await createTask.mutateAsync({
      title: values.title,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      due_date: values.due_date ? values.due_date.toISOString() : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent">
            <Sparkles className="size-5 text-primary" />
          </div>
          <DialogTitle>Create a new task</DialogTitle>
          <DialogDescription>
            Add a task to your board. You can drag it between columns later.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          key={`${open}-${defaultStatus}`}
          initial={{ status: defaultStatus }}
          submitLabel="Create task"
          loading={createTask.isPending}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
