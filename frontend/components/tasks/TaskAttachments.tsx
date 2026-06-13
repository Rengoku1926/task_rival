"use client";

import { useRef } from "react";
import { Paperclip, FileText, Upload } from "lucide-react";
import { useAttachmentsQuery, useUploadAttachment } from "@/hooks/useTasks";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatBytes, formatDate } from "@/lib/utils";

export function TaskAttachments({ taskId }: { taskId: string }) {
  const { data: attachments, isLoading } = useAttachmentsQuery(taskId);
  const upload = useUploadAttachment(taskId);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      e.target.value = "";
      return;
    }
    upload.mutate(file, { onSettled: () => (e.target.value = "") });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Paperclip className="size-4 text-primary" />
          Attachments
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={upload.isPending}
        >
          <Upload className="size-4" />
          Upload file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,text/*"
          onChange={handleFileChange}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : !attachments || attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 text-sm transition-colors hover:bg-muted/60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                {a.mime_type?.startsWith("image/") ? (
                  <Paperclip className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate font-medium text-primary hover:underline"
              >
                {a.filename}
              </a>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
                {formatBytes(a.size_bytes)} &middot; {formatDate(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Max 10 MB. Images, PDFs, and text files supported.
      </p>
    </div>
  );
}
