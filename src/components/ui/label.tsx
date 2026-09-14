import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-xs font-medium uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}
