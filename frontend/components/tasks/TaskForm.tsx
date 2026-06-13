"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { ApiException } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/types";

export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: Date | undefined;
}

interface TaskFormProps {
  initial?: Partial<Task>;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

const STATUS_DOTS: Record<TaskStatus, string> = {
  todo: "bg-rose-500",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
};

const PRIORITY_DOTS: Record<TaskPriority, string> = {
  low: "bg-zinc-400",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

function Dot({ className }: { className: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", className)} />;
}

export function TaskForm({ initial, submitLabel, loading, onSubmit, onCancel }: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    status: initial?.status ?? "todo",
    priority: initial?.priority ?? "medium",
    due_date: initial?.due_date ? new Date(initial.due_date) : undefined,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiException) {
        setFieldErrors(err.fields ?? {});
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          maxLength={255}
          placeholder="e.g. High fidelity wireframes"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        />
        <FieldError>{fieldErrors.title}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Add more details about this task..."
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
        <FieldError>{fieldErrors.description}</FieldError>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={values.status}
            onValueChange={(status) => setValues((v) => ({ ...v, status: status as TaskStatus }))}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">
                <span className="flex items-center gap-2">
                  <Dot className={STATUS_DOTS.todo} /> To Do
                </span>
              </SelectItem>
              <SelectItem value="in_progress">
                <span className="flex items-center gap-2">
                  <Dot className={STATUS_DOTS.in_progress} /> In Progress
                </span>
              </SelectItem>
              <SelectItem value="done">
                <span className="flex items-center gap-2">
                  <Dot className={STATUS_DOTS.done} /> Done
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError>{fieldErrors.status}</FieldError>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={values.priority}
            onValueChange={(priority) =>
              setValues((v) => ({ ...v, priority: priority as TaskPriority }))
            }
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <Dot className={PRIORITY_DOTS.low} /> Low
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <Dot className={PRIORITY_DOTS.medium} /> Medium
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <Dot className={PRIORITY_DOTS.high} /> High
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError>{fieldErrors.priority}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="due_date">Due date</Label>
        <DatePicker
          id="due_date"
          value={values.due_date}
          onChange={(due_date) => setValues((v) => ({ ...v, due_date }))}
          placeholder="No due date"
        />
        <FieldError>{fieldErrors.due_date}</FieldError>
      </div>

      <div className="flex justify-end gap-2.5 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
