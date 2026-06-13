// Shared button styles for Radix Action/Cancel slots that can't wrap our Button component.
export const buttonLikeClasses = {
  outline:
    "inline-flex h-9.5 cursor-pointer items-center justify-center rounded-xl border border-input bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  danger:
    "inline-flex h-9.5 cursor-pointer items-center justify-center rounded-xl bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow-sm shadow-destructive/30 transition-all hover:bg-destructive/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive",
};
