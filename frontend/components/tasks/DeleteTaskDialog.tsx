"use client";

import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { buttonLikeClasses } from "./dialogStyles";
import type { Task } from "@/types";

interface DeleteTaskDialogProps {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (task: Task) => void;
}

export function DeleteTaskDialog({ task, onOpenChange, onConfirm }: DeleteTaskDialogProps) {
  return (
    <AlertDialog open={!!task} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <Trash2 className="size-5 text-red-600 dark:text-red-400" />
        </div>
        <AlertDialogHeader className="text-center">
          <AlertDialogTitle className="text-center">Delete this task?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            <span className="font-semibold text-foreground">&ldquo;{task?.title}&rdquo;</span> will
            be permanently deleted along with its attachments and activity. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel className={buttonLikeClasses.outline}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonLikeClasses.danger}
            onClick={() => task && onConfirm(task)}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
