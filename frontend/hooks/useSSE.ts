"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { SSEEvent } from "@/types";

const INVALIDATING_EVENTS = new Set(["task_created", "task_updated", "task_deleted"]);

/**
 * Subscribes to the backend SSE stream and invalidates task queries whenever
 * a mutation event arrives, keeping the UI in sync across tabs/devices.
 */
export function useSSE() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    const es = new EventSource(`${API_URL}/events?token=${encodeURIComponent(accessToken)}`);

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        if (INVALIDATING_EVENTS.has(event.type)) {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
          if (event.payload?.id) {
            queryClient.invalidateQueries({ queryKey: ["task", event.payload.id] });
          }
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => es.close();
  }, [accessToken, queryClient]);
}
