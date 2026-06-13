export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type UserRole = "user" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  owner_email?: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  user_id: string;
  filename: string;
  url: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  task_id: string;
  user_id: string;
  action: "created" | "updated" | "deleted" | "status_changed" | "attachment_added";
  diff?: {
    before?: Partial<Task>;
    after?: Partial<Task>;
  } | null;
  created_at: string;
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}

export interface TaskListParams {
  status?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
  per_page?: number;
}

export interface SSEEvent {
  type: "connected" | "task_created" | "task_updated" | "task_deleted";
  payload?: Task;
}
