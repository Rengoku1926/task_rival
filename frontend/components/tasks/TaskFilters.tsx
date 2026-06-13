"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { TaskListParams } from "@/types";

interface TaskFiltersProps {
  value: TaskListParams;
  onChange: (value: TaskListParams) => void;
}

export function TaskFilters({ value, onChange }: TaskFiltersProps) {
  const [search, setSearch] = useState(value.q ?? "");

  // Debounce search input before pushing it into the query params.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== (value.q ?? "")) {
        onChange({ ...value, q: search || undefined, page: 1 });
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="pl-10"
        />
      </div>

      <Select
        value={value.status ?? "all"}
        onValueChange={(status) =>
          onChange({ ...value, status: status === "all" ? undefined : status, page: 1 })
        }
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="todo">To Do</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.sort ?? "created_at"}
        onValueChange={(sort) => onChange({ ...value, sort, page: 1 })}
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_at">Created date</SelectItem>
          <SelectItem value="due_date">Due date</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.order ?? "desc"}
        onValueChange={(order) => onChange({ ...value, order, page: 1 })}
      >
        <SelectTrigger className="sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="desc">Descending</SelectItem>
          <SelectItem value="asc">Ascending</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
