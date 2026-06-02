import { cn } from "@/lib/utils"

export type StatusPulseVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "processing"

type StatusPulseProps = {
  variant?: StatusPulseVariant
  pulse?: boolean
  className?: string
  label?: string
}

const dotColors: Record<StatusPulseVariant, string> = {
  success:    "bg-emerald-500 dark:bg-emerald-400",
  warning:    "bg-amber-400 dark:bg-amber-400",
  danger:     "bg-red-500 dark:bg-red-400",
  info:       "bg-sky-400 dark:bg-sky-400",
  neutral:    "bg-zinc-400 dark:bg-zinc-500",
  processing: "bg-ef-sky dark:bg-ef-sky",
}

const glowColors: Record<StatusPulseVariant, string> = {
  success:    "shadow-[0_0_6px_2px_rgba(16,185,129,0.45)]",
  warning:    "shadow-[0_0_6px_2px_rgba(251,191,36,0.45)]",
  danger:     "shadow-[0_0_6px_2px_rgba(239,68,68,0.45)]",
  info:       "shadow-[0_0_6px_2px_rgba(56,189,248,0.40)]",
  neutral:    "shadow-none",
  processing: "shadow-[0_0_6px_2px_rgba(44,167,255,0.40)]",
}

export function StatusPulse({
  variant = "neutral",
  pulse = false,
  className,
  label,
}: StatusPulseProps) {
  const dot = (
    <span
      aria-hidden={!label}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        dotColors[variant],
        pulse && "euroflo-soft-pulse",
        pulse && glowColors[variant],
        className
      )}
    />
  )

  if (!label) return dot

  return (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="sr-only">{label}</span>
    </span>
  )
}
