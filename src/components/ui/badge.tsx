import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"span"> & { tone?: "default" | "ok" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        tone === "default" && "bg-elevated text-muted",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "danger" && "bg-danger/15 text-danger",
        className,
      )}
      {...props}
    />
  );
}
