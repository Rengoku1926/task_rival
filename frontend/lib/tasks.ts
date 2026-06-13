import { api, unwrap } from "@/lib/api";
import type {
  ActivityLog,
  ApiEnvelope,
  Attachment,
  CreateTaskInput,
  PaginatedResult,
  Task,
  TaskListParams,
  UpdateTaskInput,
} from "@/types";

function buildQuery(params: TaskListParams = {}): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  if (params.page) search.set("page", String(params.page));
  if (params.per_page) search.set("per_page", String(params.per_page));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function listTasks(
  params: TaskListParams = {},
): Promise<PaginatedResult<Task>> {
  const res = await api.get<ApiEnvelope<Task[]>>(`/tasks${buildQuery(params)}`);
  const meta = res.data.meta ?? { page: 1, per_page: 20, total: 0 };
  return {
    items: res.data.data ?? [],
    page: meta.page,
    per_page: meta.per_page,
    total: meta.total,
  };
}

export async function adminListTasks(
  params: TaskListParams = {},
): Promise<PaginatedResult<Task>> {
  const res = await api.get<ApiEnvelope<Task[]>>(`/admin/tasks${buildQuery(params)}`);
  const meta = res.data.meta ?? { page: 1, per_page: 20, total: 0 };
  return {
    items: res.data.data ?? [],
    page: meta.page,
    per_page: meta.per_page,
    total: meta.total,
  };
}

export async function getTask(id: string): Promise<Task> {
  const res = await api.get<ApiEnvelope<Task>>(`/tasks/${id}`);
  return unwrap(res.data);
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await api.post<ApiEnvelope<Task>>("/tasks", input);
  return unwrap(res.data);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const res = await api.patch<ApiEnvelope<Task>>(`/tasks/${id}`, input);
  return unwrap(res.data);
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export async function getActivity(taskId: string): Promise<ActivityLog[]> {
  const res = await api.get<ApiEnvelope<ActivityLog[]>>(`/tasks/${taskId}/activity`);
  return unwrap(res.data) ?? [];
}

export async function listAttachments(taskId: string): Promise<Attachment[]> {
  const res = await api.get<ApiEnvelope<Attachment[]>>(`/tasks/${taskId}/attachments`);
  return unwrap(res.data) ?? [];
}

export interface UploadURLResponse {
  upload_url: string;
  signature: string;
  timestamp: number;
  api_key: string;
  folder?: string;
}

export async function getUploadURL(taskId: string): Promise<UploadURLResponse> {
  const res = await api.get<ApiEnvelope<UploadURLResponse>>(
    `/tasks/${taskId}/attachments/upload-url`,
  );
  return unwrap(res.data);
}

export async function registerAttachment(
  taskId: string,
  input: { filename: string; url: string; size_bytes?: number; mime_type?: string },
): Promise<Attachment> {
  const res = await api.post<ApiEnvelope<Attachment>>(
    `/tasks/${taskId}/attachments`,
    input,
  );
  return unwrap(res.data);
}
