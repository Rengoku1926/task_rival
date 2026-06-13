"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminListTasks,
  createTask,
  deleteTask,
  getActivity,
  getTask,
  getUploadURL,
  listAttachments,
  listTasks,
  registerAttachment,
  updateTask,
} from "@/lib/tasks";
import type {
  CreateTaskInput,
  PaginatedResult,
  Task,
  TaskListParams,
  UpdateTaskInput,
} from "@/types";
import { ApiException } from "@/lib/api";

export const tasksKey = (params: TaskListParams) => ["tasks", params] as const;
export const taskKey = (id: string) => ["task", id] as const;
export const activityKey = (id: string) => ["task", id, "activity"] as const;
export const attachmentsKey = (id: string) => ["task", id, "attachments"] as const;
export const adminTasksKey = (params: TaskListParams) => ["admin", "tasks", params] as const;

export function useTasksQuery(params: TaskListParams) {
  return useQuery({
    queryKey: tasksKey(params),
    queryFn: () => listTasks(params),
  });
}

export function useAdminTasksQuery(params: TaskListParams) {
  return useQuery({
    queryKey: adminTasksKey(params),
    queryFn: () => adminListTasks(params),
  });
}

export function useTaskQuery(id: string) {
  return useQuery({
    queryKey: taskKey(id),
    queryFn: () => getTask(id),
    enabled: !!id,
  });
}

export function useActivityQuery(id: string) {
  return useQuery({
    queryKey: activityKey(id),
    queryFn: () => getActivity(id),
    enabled: !!id,
  });
}

export function useAttachmentsQuery(id: string) {
  return useQuery({
    queryKey: attachmentsKey(id),
    queryFn: () => listAttachments(id),
    enabled: !!id,
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiException) return err.message;
  return "Something went wrong. Please try again.";
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTaskInput & { id: string }) => updateTask(id, input),
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: taskKey(id) });
      const previousTask = queryClient.getQueryData<Task>(taskKey(id));
      const previousLists = queryClient.getQueriesData<PaginatedResult<Task>>({
        queryKey: ["tasks"],
      });

      if (previousTask) {
        queryClient.setQueryData<Task>(taskKey(id), { ...previousTask, ...input });
      }

      queryClient.setQueriesData<PaginatedResult<Task>>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((t) => (t.id === id ? { ...t, ...input } : t)),
        };
      });

      return { previousTask, previousLists, id };
    },
    onError: (err, _input, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKey(context.id), context.previousTask);
      }
      context?.previousLists?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(errorMessage(err));
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: activityKey(id) });
    },
    onSuccess: () => toast.success("Task updated"),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousLists = queryClient.getQueriesData<PaginatedResult<Task>>({
        queryKey: ["tasks"],
      });

      queryClient.setQueriesData<PaginatedResult<Task>>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((t) => t.id !== id),
          total: Math.max(0, old.total - 1),
        };
      });

      return { previousLists };
    },
    onError: (err, _id, context) => {
      context?.previousLists?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onSuccess: () => toast.success("Task deleted"),
  });
}

export function useUploadAttachment(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const { upload_url, signature, timestamp, api_key, folder } = await getUploadURL(taskId);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", api_key);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      if (folder) formData.append("folder", folder);

      const uploadRes = await fetch(upload_url, { method: "POST", body: formData });
      if (!uploadRes.ok) {
        throw new Error("Upload to Cloudinary failed");
      }
      const uploaded = await uploadRes.json();

      return registerAttachment(taskId, {
        filename: file.name,
        url: uploaded.secure_url,
        size_bytes: uploaded.bytes,
        mime_type: file.type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentsKey(taskId) });
      queryClient.invalidateQueries({ queryKey: activityKey(taskId) });
      toast.success("Attachment uploaded");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
