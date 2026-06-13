"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", id, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-9.5 w-full cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3.5 text-sm shadow-xs transition-colors hover:border-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15",
            value ? "text-foreground" : "text-muted-foreground/70",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">
            {value ? format(value, "PPP") : placeholder}
          </span>
          {value && (
            <span
              role="button"
              aria-label="Clear date"
              className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            >
              <X className="size-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
