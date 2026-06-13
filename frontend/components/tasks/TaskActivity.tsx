"use client";

import { History } from "lucide-react";
import { useActivityQuery } from "@/hooks/useTasks";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateTime, cn } from "@/lib/utils";
import type { ActivityLog } from "@/types";

const ACTION_LABELS: Record<ActivityLog["action"], string> = {
  created: "created the task",
  updated: "updated the task",
  deleted: "deleted the task",
  status_changed: "changed the status",
  attachment_added: "added an attachment",
};

const ACTION_DOT_CLASSES: Record<ActivityLog["action"], string> = {
  created: "bg-emerald-500",
  updated: "bg-blue-500",
  deleted: "bg-red-500",
  status_changed: "bg-amber-500",
  attachment_added: "bg-violet-500",
};

function describeDiff(log: ActivityLog): string | null {
  const before = log.diff?.before;
  const after = log.diff?.after;
  if (!before || !after) return null;

  const changes: string[] = [];
  const fields: (keyof typeof after)[] = ["title", "status", "priority", "due_date", "description"];
  for (const field of fields) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changes.push(`${field.replace("_", " ")}: "${before[field] ?? "—"}" → "${after[field] ?? "—"}"`);
    }
  }
  return changes.length > 0 ? changes.join(", ") : null;
}

export function TaskActivity({ taskId }: { taskId: string }) {
  const { data: logs, isLoading } = useActivityQuery(taskId);

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="size-4 text-primary" />
        Activity
      </h2>

      {isLoading ? (
        <Spinner />
      ) : !logs || logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-4">
          {logs.map((log) => {
            const detail = describeDiff(log);
            return (
              <li key={log.id} className="relative pl-5">
                <span
                  className={cn(
                    "absolute left-0 top-1.5 size-2 rounded-full ring-2 ring-card",
                    ACTION_DOT_CLASSES[log.action] ?? "bg-muted-foreground",
                  )}
                />
                <span className="absolute left-[3.5px] top-3.5 h-[calc(100%-0.25rem)] w-px bg-border last:hidden" />
                <p className="text-sm text-foreground/90">
                  {ACTION_LABELS[log.action] ?? log.action}
                </p>
                {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
                <p className="text-xs text-muted-foreground/70">{formatDateTime(log.created_at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
